# AIRIS UI on the Existing AWS Stack

## Purpose

Deploy `/Users/tojojose/trominos/airis-ui` as a static Next.js site in its
existing unprivileged Nginx container, while reusing the AWS infrastructure
already managed by `/Users/tojojose/trominos/airis/terraform`.

This is a plan only. It does not authorize a Terraform apply, image push, DNS
change, certificate export, or any other AWS mutation.

## Decision

Reuse the backend Terraform stack and add a separate UI task definition and ECS
service.

The target request path will be:

```text
browser
  -> https://app.trominos.com:443
  -> API Gateway HTTP API for the UI (TLS termination)
  -> existing API Gateway VPC Link
  -> new Cloud Map service: ui
  -> new ECS Fargate service and task
  -> Nginx container on port 8080
```

The API remains unchanged:

```text
browser
  -> https://api.trominos.com:443
  -> existing API Gateway HTTP API
  -> existing VPC Link
  -> existing Cloud Map service: api
  -> existing API ECS service on port 80
```

## Important port clarification

`docker run --rm -p 3000:8080 airis-ui:local` is only a local-development port
mapping:

- `3000` is the port opened on the Mac.
- `8080` is the Nginx port inside the container.

AWS will not reproduce the Mac-side port `3000`. The ECS task and Cloud Map
registration will use container port `8080`. Public HTTPS port `443` belongs to
API Gateway, not Nginx.

## Certificate decision: do not download it

The existing backend Terraform already discovers `*.trominos.com` from ACM with
`data.aws_acm_certificate.wildcard`. Reuse that data source and reference its ARN
from the new `aws_apigatewayv2_domain_name` for `app.trominos.com`.

Do not download the certificate or private key into the UI project, Docker
image, ECS task, Terraform variables, Terraform state, or Git. API Gateway is an
ACM-integrated service and accepts the certificate ARN directly. The certificate
must be in the same AWS Region as the Regional API Gateway endpoint. This is the
same pattern already used successfully for `api.trominos.com`.

AWS documentation:

- [Regional API Gateway custom domains](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-regional-api-custom-domain-create.html)
- [Preparing ACM certificates for API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-specify-certificate-for-custom-domain-name.html)

### If certificate export is still requested later

Treat export as a separate security-sensitive decision, not part of this
deployment. First inspect whether the certificate is exportable. ACM public
certificates created before June 17, 2025 cannot be exported, and newer public
certificates must have export enabled. Export also introduces private-key
storage, secure injection, renewal distribution, and incident-response work.

If an exportable certificate is ever genuinely required, the future runbook
would:

1. Resolve the certificate ARN without printing private material.
2. Verify its type, issuance date, status, and export setting.
3. Create a passphrase file outside the repository with restrictive file
   permissions and no trailing newline.
4. Run `aws acm export-certificate` with `--passphrase fileb://...`.
5. Store the encrypted key in a purpose-built secret store and delete local
   temporary material.
6. Build automated renewal and redeployment before using it in production.

That procedure is unnecessary here and should not be performed. See
[ACM exportable public certificates](https://docs.aws.amazon.com/acm/latest/userguide/acm-exportable-certificates.html).

## What can be shared

The following existing backend resources can be reused:

| Existing resource | Reuse approach |
|---|---|
| AWS provider and region | Use the existing provider in `terraform/main.tf` |
| Default VPC and public subnets | Place the UI task in the same subnets |
| Wildcard ACM certificate data source | Reference the same ARN for `app.trominos.com` |
| Route 53 hosted-zone data source | Create only the new `app.trominos.com` alias |
| ECS cluster `airis` | Run a second ECS service in the same cluster |
| ECS execution role | Reuse it for ECR pulls and CloudWatch logs |
| Cloud Map private namespace | Add a second service called `ui` |
| API Gateway VPC Link | Reuse it for the UI integration |
| VPC Link security group | Add narrowly scoped egress to UI port 8080 |

The UI still needs its own ECR repository, task definition, ECS service,
CloudWatch log group, Cloud Map service, task security group, HTTP API,
integration, routes, stage, custom domain, API mapping, and Route 53 record.

## Why use a separate HTTP API

The existing HTTP API has a `$default` route that proxies every path to the
backend Cloud Map service. Reusing that same API for the UI would create route
and host-routing ambiguity.

Create a second HTTP API for the UI, but attach its private integration to the
existing VPC Link. HTTP APIs have no fixed hourly API charge; billing is based
primarily on requests. This keeps API and UI routing independent without adding
an ALB or NAT gateway.

## Terraform changes in the backend repository

All AWS resources should remain owned by one Terraform state under:

`/Users/tojojose/trominos/airis/terraform`

Do not apply both the existing standalone UI Terraform directory and the shared
backend Terraform stack. Two Terraform states must never own the same resource.

### 1. Variables

Add UI-specific variables to `terraform/variables.tf`:

- `ui_domain_name`, default `app.trominos.com`
- `ui_image_tag`, with no `latest` production default
- `ui_desired_count`, default `0` for bootstrap
- `ui_task_cpu`, default `256`
- `ui_task_memory`, default `512`
- `ui_container_port`, default `8080`
- `ui_clerk_publishable_key` is **not** an ECS runtime variable because static
  Next.js public values are compiled into the image; supply it only at image
  build time

Use immutable image tags such as a Git commit SHA.

### 2. ECR

Add a new `terraform/ui-ecr.tf`:

- Create `aws_ecr_repository.ui` named `airis-ui`.
- Set immutable tags.
- Enable scan-on-push.
- Add a lifecycle policy retaining the newest ten images.
- Do not reuse `airis-api`; UI and API images have independent release cycles.

Before creating the repository, check whether `airis-ui` already exists. If it
does, either import it into this Terraform state or use a data source. Do not
create a duplicate name or delete an existing repository blindly.

### 3. UI task definition and service

Add `terraform/ui-ecs.tf`:

- CloudWatch log group: `/ecs/airis-ui`.
- Fargate task family: `airis-ui`.
- Runtime: Linux `X86_64`, matching the `linux/amd64` image.
- Container name: `ui`.
- Image: `${aws_ecr_repository.ui.repository_url}:${var.ui_image_tag}`.
- Container port: `8080` TCP.
- Health check: `wget -q -O /dev/null http://127.0.0.1:8080/healthz`.
- Reuse `aws_iam_role.execution.arn` as `execution_role_arn`.
- Do not assign the backend's Bedrock/S3/DynamoDB task role to the UI. Static
  Nginx needs no application AWS permissions.
- Create a separate ECS service named `airis-ui` in `aws_ecs_cluster.main`.
- Use the same public subnets and `assign_public_ip = true` so Fargate can pull
  from ECR and send logs without adding a NAT gateway.
- Start with `ui_desired_count = 0`, then change it to `1` only after the image
  exists in ECR.
- Enable deployment circuit breaker with rollback.
- Register the service in the new Cloud Map UI service with port `8080`.

Do not put the UI container inside the backend task definition in the first
release. A sidecar could reduce one Fargate task and one public IPv4 charge, but
it would couple API and UI deployment, scaling, health, and rollback. It also
complicates Cloud Map registration because the current service is registered on
port 80. Revisit a combined task only after measuring cost and accepting that
operational coupling.

### 4. Cloud Map

Add to `terraform/cloudmap.tf` or create `terraform/ui-cloudmap.tf`:

- Reuse `aws_service_discovery_private_dns_namespace.airis`.
- Create `aws_service_discovery_service.ui` named `ui`.
- Use an SRV record, TTL 10, and the same custom-health pattern as the API.
- Register ECS task port `8080` explicitly.

SRV is required because API Gateway needs both the task IP and port from Cloud
Map. Do not use an A-only registration.

### 5. Security groups

Add a dedicated `aws_security_group.ui_task` rather than giving the UI the
backend task security group.

Add only these rules:

- Existing VPC Link SG -> UI task SG on TCP 8080.
- UI task SG inbound TCP 8080 from the VPC Link SG only.
- UI task SG outbound as needed for ECR image pull and CloudWatch logs.

There must be no internet CIDR ingress to the UI task. Its public IP is for
egress only.

### 6. API Gateway

Add `terraform/ui-apigw.tf`:

- Create a second HTTP API named `airis-ui`.
- Reuse `aws_apigatewayv2_vpc_link.main.id`.
- Create a private `HTTP_PROXY` integration whose URI is
  `aws_service_discovery_service.ui.arn`.
- Add a `$default` route and auto-deploying `$default` stage.
- Create the Regional custom domain `app.trominos.com`.
- Reference `data.aws_acm_certificate.wildcard.arn` directly.
- Use at least TLS 1.2.
- Map the UI HTTP API's `$default` stage to that custom domain.

The public browser connection is HTTPS on 443. API Gateway-to-Nginx traffic
inside the VPC is HTTP on 8080. This is the intended TLS boundary.

### 7. DNS

Add `terraform/ui-dns.tf`:

- Create a Route 53 alias A record for `app.trominos.com`.
- Target the UI API Gateway custom domain's Regional target and hosted-zone ID.
- Guard creation with a `ui_manage_dns` variable defaulting to `false`.

Before enabling DNS management, inspect any existing A, AAAA, or CNAME records
for `app.trominos.com`. If another host currently owns the name, plan an explicit
cutover. Never overwrite the record during the bootstrap apply.

### 8. Outputs

Add:

- `ui_url`
- `ui_execute_api_url`
- `ui_ecr_repository_url`
- `ui_service_name`
- `ui_log_group`

The raw execute-api URL allows validation before DNS changes.

## UI build inputs

The Docker image must be built from `/Users/tojojose/trominos/airis-ui` with:

- Platform `linux/amd64`
- `NEXT_PUBLIC_TROMINOS_API_URL=https://api.trominos.com`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<Clerk publishable key>`

These are public browser settings compiled into static JavaScript. They cannot
be changed by ECS environment variables without rebuilding the image.

The backend already allows these CORS origins:

- `https://app.trominos.com`
- `http://localhost:3000`

Keep local Docker mapped as `3000:8080`. Production uses
`https://app.trominos.com`; do not add an `http://app.trominos.com` origin.

## Safe implementation and deployment sequence

### Phase 1: protect the current state

1. Confirm both repositories have clean Git status.
2. Back up the current backend Terraform state using the configured backend's
   supported state-pull operation.
3. Record current outputs and the ECS/API Gateway/Cloud Map resource IDs.
4. Confirm the standalone `/airis-ui/terraform` stack has never been applied.
   If it has state, inventory it before making any ownership decision.

### Phase 2: add shared-stack code

1. Add the UI Terraform resources described above to the backend repository.
2. Run `terraform fmt -check` and `terraform validate`.
3. Run a targeted review of the full `terraform plan` with:
   - UI desired count `0`
   - UI DNS management `false`
4. Require the plan to show no replacement or deletion of the live API, VPC
   Link, ACM certificate, Route 53 zone, knowledge base, DynamoDB table, or S3
   configuration.

Stop if Terraform proposes replacing any existing backend resource.

### Phase 3: bootstrap UI infrastructure

1. Apply only after plan review and approval.
2. Create the UI ECR repository and zero-count UI service dependencies.
3. Keep DNS disabled.
4. Confirm the existing API health endpoint remains healthy.

### Phase 4: build and push

1. Use the UI Git commit SHA as the image tag.
2. Authenticate Docker to the new ECR repository.
3. Build and push the `linux/amd64` image with both public build arguments.
4. Verify the ECR image digest and scan result.

### Phase 5: start and validate without DNS

1. Apply `ui_image_tag=<commit SHA>` and `ui_desired_count=1`, leaving UI DNS
   disabled.
2. Wait for one healthy ECS task and a healthy Cloud Map registration carrying
   both IP and port 8080.
3. Test the raw UI execute-api URL:
   - `/` returns 200 and HTML.
   - `/healthz` returns 200 and `ok`.
   - `/manifest.webmanifest` returns 200.
   - A missing static asset returns 404.
4. Sign in through Clerk and verify browser calls to `api.trominos.com` have no
   CORS failures.
5. Recheck `https://api.trominos.com/healthz` to prove the shared changes did
   not disturb the backend.

### Phase 6: DNS cutover

1. Inspect the current `app.trominos.com` DNS answer and record it for rollback.
2. Review a Terraform plan with UI DNS management enabled.
3. Apply the Route 53 alias only after approval.
4. Verify `https://app.trominos.com`, TLS certificate coverage, Clerk sign-in,
   API calls, and static asset caching.
5. Keep the previous hosted UI available until production verification passes.

### Phase 7: retire duplicate UI Terraform safely

After the shared stack is stable:

1. Do not run `terraform destroy` in the standalone UI directory without first
   confirming whether it owns any resources.
2. If it was never applied, archive or remove only its Terraform configuration.
3. If it has state, migrate or remove state ownership deliberately before
   deleting configuration.
4. Keep the UI Dockerfile, Nginx configuration, application source, and
   deployment README in the UI repository.

## Rollback

### Before DNS cutover

- Set `ui_desired_count` back to `0`.
- The existing hosted site and API remain unchanged.

### After DNS cutover

- Restore the recorded previous `app.trominos.com` DNS target or disable the
  Terraform-managed UI alias through a reviewed plan.
- Keep the previous UI host alive during the validation window.
- If only the new image is faulty, set `ui_image_tag` to the previous immutable
  tag and apply; the ECS deployment circuit breaker provides an additional
  safety net.

The API's `api.trominos.com` record and service must not be altered during a UI
rollback.

## Cost effect

Reusing the backend stack avoids an ALB, NAT gateway, second VPC, second Cloud
Map namespace, duplicate certificate, and duplicate VPC Link. ECS clusters and
HTTP APIs do not create the major fixed costs in this design.

The unavoidable added cost for a separate always-on Docker UI is primarily:

- One small Fargate task, proposed at 0.25 vCPU and 0.5 GB.
- One public IPv4 address for that task.
- Small CloudWatch log, Cloud Map registration, and API Gateway request charges.

Set `ui_desired_count=0` when the UI is intentionally offline to stop Fargate
and public-IPv4 task charges. If lowest possible hosting cost becomes more
important than the Docker/Nginx requirement, a static S3 plus CloudFront design
would be cheaper than any always-on Fargate container and should be evaluated as
a separate architecture decision.

## Acceptance criteria

- Only the backend Terraform state owns AWS deployment resources.
- The live backend has no replacement or outage during UI deployment.
- UI image is immutable, scanned, and built for `linux/amd64`.
- UI task is reachable only through the shared VPC Link on port 8080.
- `https://app.trominos.com` serves a valid wildcard-certificate HTTPS session.
- No certificate or private key is downloaded, committed, baked into Docker, or
  stored in Terraform state.
- Clerk sign-in and API calls work from the production origin.
- The previous UI target is recorded and rollback is tested or documented.
