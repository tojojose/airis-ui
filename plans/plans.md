# Airis UI Docker, Nginx, and Terraform Implementation Plan

## 1. Objective

Deploy the Airis UI from `/Users/tojojose/trominos/airis-ui` as a Docker image
containing an Nginx web server, provisioned on AWS with Terraform, and exposed
at the stable HTTPS hostname `https://app.trominos.com`.

The deployed UI must:

- Preserve the current visual experience and Clerk authentication.
- Send authenticated requests to the existing API at
  `https://api.trominos.com`.
- Run as a static Next.js export served by Nginx.
- Run in ECS Fargate without an Application Load Balancer or NAT Gateway.
- Use API Gateway HTTP API, VPC Link, and Cloud Map, matching the proven Airis
  backend architecture.
- Be independently deployable and destructible without affecting the Airis API,
  Bedrock knowledge base, DynamoDB, or S3 resources.
- Keep the existing ChatGPT Site available until the AWS deployment is verified.

## 2. Current-State Findings

The project is currently a Vinext/Cloudflare Sites application rather than a
static Nginx application.

Important current characteristics:

- `app/page.tsx`, `app/admin-console.tsx`, and `app/pipeline-run.tsx` are client
  components.
- The browser currently calls `/api/trominos`.
- `app/api/trominos/[...path]/route.ts` is a server-side proxy to
  `https://api.trominos.com`.
- The proxy requires the Next/Vinext runtime and cannot execute inside Nginx.
- `vite.config.ts` and the package dependencies contain Cloudflare Sites-specific
  build tooling.
- Clerk authentication runs in the browser and can continue working after a
  static export.
- The Airis backend already accepts Clerk bearer tokens.
- The backend Terraform already permits `https://app.trominos.com` in its CORS
  origin setting.
- The directory is not currently a Git repository.

The server-side proxy must therefore be removed. The static browser application
will call `https://api.trominos.com` directly and send the Clerk JWT in the
`Authorization` header.

## 3. Target Architecture

```text
Browser
  |
  +-- https://app.trominos.com
  |     -> Route 53 alias
  |     -> API Gateway HTTP API
  |     -> VPC Link
  |     -> Cloud Map SRV discovery
  |     -> ECS Fargate task
  |     -> Nginx on port 8080
  |     -> static HTML, JavaScript, CSS, icons, manifest, service worker
  |
  +-- https://api.trominos.com
        -> existing Airis API
        -> Authorization: Bearer <Clerk JWT>
```

TLS terminates at API Gateway. Traffic from API Gateway to Nginx stays HTTP
inside the VPC. The ECS task receives a public IP only for outbound startup
traffic such as ECR image pulls and CloudWatch logging. Its security group must
not allow direct inbound internet traffic.

## 4. Locked Implementation Decisions

| Area | Decision |
|---|---|
| Rendering | Next.js static export using `output: "export"` |
| Web server | Unprivileged Nginx Alpine container |
| Container port | 8080 |
| API access | Browser calls `https://api.trominos.com` directly |
| Authentication | Existing Clerk session token in `Authorization: Bearer` |
| Compute | One ECS Fargate task, initially 0.25 vCPU and 512 MB |
| Exposure | API Gateway HTTP API + VPC Link + Cloud Map |
| TLS | Existing `*.trominos.com` ACM certificate |
| DNS | Route 53 alias for `app.trominos.com` |
| Image registry | Dedicated ECR repository named `airis-ui` |
| Image tags | Immutable Git commit SHA; do not deploy `latest` |
| Terraform ownership | Independent Terraform stack inside `airis-ui/terraform` |
| Cutover | Keep the ChatGPT Site until the AWS deployment passes acceptance tests |

## 5. Planned Repository Layout

```text
airis-ui/
  app/
    admin-console.tsx
    clerk-auth.tsx
    globals.css
    layout.tsx
    page.tsx
    pipeline-run.tsx
  public/
  plans/
    plans.md
  terraform/
    main.tf
    variables.tf
    ecr.tf
    iam.tf
    ecs.tf
    cloudmap.tf
    sg.tf
    apigw.tf
    dns.tf
    outputs.tf
    terraform.tfvars.example
  .dockerignore
  .env.example
  .gitignore
  Dockerfile
  nginx.conf
  next.config.ts
  package.json
  package-lock.json
  tsconfig.json
```

The following Cloudflare Sites files can be removed after the static migration
is verified:

```text
.openai/
vite.config.ts
```

The existing ChatGPT Site remains deployed remotely even after these local files
are removed.

## 6. Phase 1: Establish Source Control

1. Initialize Git in `/Users/tojojose/trominos/airis-ui`.
2. Add a `.gitignore` covering:
   - `node_modules/`
   - `.next/`
   - `out/`
   - `.env*`, while retaining `.env.example`
   - `.DS_Store`
   - Terraform state and plan files
   - `.terraform/`
3. Commit the current unmodified source as the migration baseline.
4. Create a branch such as `codex/docker-nginx-deployment`.
5. Do not commit credentials, Terraform state, Clerk secret keys, AWS keys, or
   generated build output.

### Phase 1 completion gate

- The source is committed.
- The worktree is clean before migration edits begin.
- The baseline commit can restore the current ChatGPT Sites source.

## 7. Phase 2: Convert to a Static Next.js Application

### 7.1 Update the package scripts

Replace the Vinext scripts with standard Next.js scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint . --ignore-pattern out --ignore-pattern .next"
  }
}
```

### 7.2 Remove runtime-only dependencies

Remove the Cloudflare/Vinext packages if no longer used:

- `vinext`
- `vite`
- `wrangler`
- `@openai/sites-vite-plugin`
- `@cloudflare/vite-plugin`
- `@cloudflare/workers-types`
- `@vitejs/plugin-react`
- `@vitejs/plugin-rsc`

Keep Next.js, React, React DOM, TypeScript, ESLint, Tailwind/PostCSS if used, and
Lucide React.

Run `npm install` after changing dependencies so `package-lock.json` matches the
new package graph.

### 7.3 Enable static export

Update `next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
};

export default nextConfig;
```

`npm run build` must produce the static site in `out/`.

### 7.4 Remove the server-side API proxy

Delete:

```text
app/api/trominos/[...path]/route.ts
```

Remove now-empty `.DS_Store` files and empty API directories.

### 7.5 Centralize the API base URL

Create a small shared module, for example `app/api-config.ts`:

```ts
export const API_URL =
  process.env.NEXT_PUBLIC_TROMINOS_API_URL ??
  'https://api.trominos.com';
```

Use this shared value in:

- `app/page.tsx`
- `app/admin-console.tsx`
- `app/pipeline-run.tsx`

Remove their local `const API_URL = '/api/trominos'` declarations.

### 7.6 Preserve authentication

Continue obtaining a token from Clerk and sending:

```http
Authorization: Bearer <Clerk JWT>
```

Do not place an API key in browser code or a Docker build argument.

Add `.env.example`:

```env
NEXT_PUBLIC_TROMINOS_API_URL=https://api.trominos.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
```

These are public browser configuration values and are baked into the static
JavaScript during `next build`.

### 7.7 Verify CORS before deployment

Confirm the live backend allows:

```text
https://app.trominos.com
```

Verify both ordinary JSON requests and multipart image uploads. Do not add a
second CORS layer in Nginx.

### Phase 2 completion gate

- `npm ci` succeeds with Node 22.
- `npm run build` succeeds.
- `out/index.html` exists.
- No dynamic route handler remains.
- The UI works locally from a simple static file server.
- Clerk sign-in and one authenticated API request succeed locally.

## 8. Phase 3: Build the Nginx Container

### 8.1 Dockerfile

Create a multi-stage Dockerfile:

1. `node:22-alpine` build stage.
2. Copy `package.json` and `package-lock.json` first for dependency caching.
3. Run `npm ci`.
4. Copy the application source.
5. Accept build arguments for the public API URL and Clerk publishable key.
6. Run `npm run build`.
7. Use `nginxinc/nginx-unprivileged:alpine` for the runtime stage.
8. Copy `out/` to the Nginx document root.
9. Copy `nginx.conf`.
10. Expose port 8080.

The runtime image must contain no Node.js runtime, source files, package manager,
AWS credentials, Terraform files, or private secrets.

### 8.2 Nginx configuration

The Nginx server should:

- Listen on port 8080.
- Serve the exported Next.js files.
- Return HTTP 200 from `/healthz`.
- Resolve exported routes using `try_files`.
- Serve `404.html` for real missing files.
- Cache fingerprinted `/_next/static/` assets for one year with `immutable`.
- Avoid long caching for HTML, `sw.js`, and `manifest.webmanifest`.
- Enable compression for HTML, CSS, JavaScript, JSON, SVG, and manifest files.
- Add at least these headers:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: SAMEORIGIN`, unless framing is intentionally required
- Avoid an overly strict Content Security Policy until Clerk and API origins are
  fully enumerated and tested.

### 8.3 Docker ignore file

Exclude:

```text
node_modules
.next
out
.git
.DS_Store
.env*
terraform
plans
```

### 8.4 Local container tests

Build for the production platform:

```bash
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_TROMINOS_API_URL=https://api.trominos.com \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<publishable-key> \
  --load \
  -t airis-ui:local .
```

Run:

```bash
docker run --rm -p 8080:8080 airis-ui:local
```

Test:

- `GET http://localhost:8080/` returns 200.
- `GET http://localhost:8080/healthz` returns 200.
- Static JS and CSS files return 200.
- A nonexistent asset returns 404 rather than the homepage.
- Refreshing the root page succeeds.
- Clerk sign-in works.
- An authenticated analysis reaches `api.trominos.com`.
- A multipart image upload works.

### Phase 3 completion gate

- The production-platform Docker image builds.
- The container runs as a non-root user.
- Nginx health and asset tests pass.
- No credentials appear in `docker history` or the generated JavaScript.

## 9. Phase 4: Create the Terraform Stack

Create an independent Terraform root at `airis-ui/terraform`.

### 9.1 Provider and data sources

`main.tf` should define:

- Terraform version constraint.
- HashiCorp AWS provider version compatible with the existing account stack.
- AWS region variable, default `us-east-1`.
- Current AWS account identity.
- Default VPC data source.
- Default public subnet data source.
- Existing issued `*.trominos.com` ACM certificate data source.
- Existing `trominos.com` Route 53 zone data source.

Use remote Terraform state before treating the deployment as production. The
state must not be committed to Git.

### 9.2 Variables

Define at least:

```text
aws_region
project_name                default airis-ui
domain_name                 default app.trominos.com
zone_name                   default trominos.com
image_tag
desired_count               default 0 for bootstrap, then 1
task_cpu                     default 256
task_memory                  default 512
container_port              default 8080
log_retention_days          default 30
```

Mark sensitive variables appropriately, although this UI stack should not need
application secrets.

### 9.3 ECR

Create an ECR repository named `airis-ui` with:

- Image scanning on push.
- Immutable tags, if the deployment process always uses unique commit SHAs.
- Lifecycle policy retaining approximately the newest 10 production images.

Output the repository URL.

### 9.4 IAM

Create an ECS task execution role that can:

- Pull the image from ECR.
- Write container logs to CloudWatch.

The Nginx task requires no Bedrock, S3, DynamoDB, Clerk secret, or API task-role
permissions. Either omit the task role or create an intentionally empty role if
required by organizational policy.

### 9.5 CloudWatch logs

Create:

```text
/ecs/airis-ui
```

Set retention to 30 days initially.

### 9.6 ECS cluster, task definition, and service

Create a dedicated ECS cluster named `airis-ui` for clean ownership.

Task definition:

- Fargate compatibility.
- `awsvpc` network mode.
- Linux x86_64 runtime platform.
- 256 CPU units.
- 512 MB memory.
- Nginx container image from ECR using `var.image_tag`.
- Container port 8080.
- CloudWatch log configuration.
- Container health check against `http://127.0.0.1:8080/healthz`.

Service:

- One desired task after bootstrap.
- Public default subnets.
- Public IP enabled for outbound ECR/log access without NAT.
- UI task security group.
- Cloud Map service registration with port 8080.
- Deployment circuit breaker with rollback enabled.
- Wait for steady state during deployment.

### 9.7 Cloud Map

Create a private DNS namespace such as:

```text
airis-ui.local
```

Create service `ui` with an SRV record and custom health configuration. ECS must
register both the task IP and port so API Gateway can discover it correctly.

### 9.8 Security groups

Create two security groups:

1. VPC Link security group.
   - Egress TCP 8080 only to the UI task security group.
2. UI task security group.
   - Ingress TCP 8080 only from the VPC Link security group.
   - Required outbound traffic for image startup and logging.

Do not add `0.0.0.0/0` ingress to the UI task. Its public IP is for egress, not
direct web access.

### 9.9 API Gateway HTTP API

Create:

- An API Gateway HTTP API named `airis-ui`.
- A VPC Link using the public subnets and VPC Link security group.
- A private `HTTP_PROXY` integration targeting the Cloud Map UI service ARN.
- Payload format version 1.0.
- A `$default` route and `$default` stage with auto-deploy.
- Access logs if a suitable CloudWatch log format is configured.

The integration forwards all UI and static-asset paths to Nginx.

### 9.10 Custom domain and DNS

Create the API Gateway custom domain:

```text
app.trominos.com
```

Use the existing issued wildcard ACM certificate and TLS 1.2.

Create a Route 53 alias A record pointing `app.trominos.com` at the API Gateway
custom-domain target.

Before creating the record, inspect Route 53 for an existing
`app.trominos.com` record. If one exists, decide whether to import it into this
stack or replace it during cutover. Never create a duplicate or overwrite an
unidentified record.

### 9.11 Outputs

Output:

- Public UI URL.
- Raw API Gateway URL.
- ECR repository URL.
- ECS cluster name.
- ECS service name.
- CloudWatch log group.
- Route 53 record name.

### Phase 4 completion gate

- `terraform fmt -check` succeeds.
- `terraform init` succeeds.
- `terraform validate` succeeds.
- `terraform plan` contains only expected UI resources.
- No backend Airis API resources are scheduled for change or deletion.
- No credentials or local state are staged in Git.

## 10. Phase 5: Bootstrap and First Deployment

Use two applies so the ECR repository exists before ECS attempts to start the
container.

### 10.1 Bootstrap infrastructure

```bash
cd terraform
terraform init
terraform plan -var='desired_count=0'
terraform apply -var='desired_count=0'
```

This creates ECR and the deployment infrastructure while keeping the ECS service
stopped.

### 10.2 Authenticate to ECR

Use the repository URL from Terraform output and authenticate Docker with the
AWS CLI. Do not save a long-lived registry password.

### 10.3 Build and push an immutable image

Use the Git commit SHA as the image tag:

```bash
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_TROMINOS_API_URL=https://api.trominos.com \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<publishable-key> \
  -t <ecr-url>:<git-sha> \
  --push .
```

Record the tag used for deployment.

### 10.4 Start the ECS service

```bash
terraform plan \
  -var='image_tag=<git-sha>' \
  -var='desired_count=1'

terraform apply \
  -var='image_tag=<git-sha>' \
  -var='desired_count=1'
```

Wait for ECS to report a stable service with one healthy task.

### 10.5 Validate before DNS cutover

Test the raw API Gateway URL first:

- Homepage returns 200.
- `/healthz` returns 200.
- Static assets return 200.
- Browser renders the full application.
- Clerk loads.
- API calls reach `api.trominos.com` without CORS errors.

Only proceed to DNS cutover after these tests pass.

## 11. Phase 6: DNS Cutover

1. Determine the current owner and value of any existing `app.trominos.com`
   record.
2. Lower TTL in advance if replacing a non-alias record.
3. Apply the Route 53 alias to the API Gateway custom domain.
4. Verify DNS resolution.
5. Verify the wildcard certificate is presented for `app.trominos.com`.
6. Verify HTTP redirects or HTTPS-only behavior as expected.
7. Keep the ChatGPT Sites URL available as the rollback path.

## 12. End-to-End Acceptance Tests

The deployment is accepted only when all of the following pass:

### Infrastructure

- ECS service has one stable healthy task.
- Cloud Map shows the task IP and port 8080.
- API Gateway returns the Nginx response.
- The task security group has no public inbound rule.
- CloudWatch receives Nginx logs.
- ECR contains the deployed immutable image tag.

### Web application

- `https://app.trominos.com/` returns 200 with valid TLS.
- `/healthz` returns 200.
- Icons, manifest, social image, CSS, and JavaScript load.
- Refreshing the application does not return 404.
- Mobile and desktop layouts render correctly.
- The service worker does not pin an obsolete build.

### Authentication and authorization

- Clerk sign-in opens and completes.
- Organization switching works.
- Admin-only navigation is visible only for the configured admin organization.
- A non-admin user cannot use admin API operations.
- No Clerk secret key or API key appears in browser assets.

### API workflows

- Project and model data load.
- Image upload works.
- Pipeline stage discovery works.
- Pipeline execution works.
- Analysis results and bounding boxes render.
- Prompt Studio operations work for an authorized admin.
- Browser console contains no CORS, mixed-content, or failed asset errors.

## 13. Rollback Plan

### Application rollback

Redeploy the previous known-good ECR image tag:

```bash
terraform apply -var='image_tag=<previous-sha>' -var='desired_count=1'
```

The ECS deployment circuit breaker should automatically roll back failed task
deployments, but the previous image tag must still be retained in ECR.

### DNS rollback

If API Gateway, Cloud Map, or ECS is unavailable, restore the prior Route 53
record or direct users to the existing ChatGPT Sites URL.

### Cost stop

To stop Fargate compute while retaining infrastructure:

```bash
terraform apply -var='desired_count=0'
```

Do not run `terraform destroy` as the first rollback response. Preserve logs and
configuration until the cause is understood.

## 14. CI/CD Follow-Up

Implement automation only after the first manual deployment succeeds.

Recommended pipeline:

1. Install Node 22 dependencies with `npm ci`.
2. Run lint.
3. Run static build.
4. Build the Linux AMD64 image.
5. Scan the image.
6. Push a Git-SHA tag to ECR.
7. Run `terraform fmt -check`, `validate`, and `plan`.
8. Require production approval.
9. Apply the new image tag.
10. Wait for ECS service stability.
11. Smoke-test `/healthz` and `/`.
12. Roll back to the previous image tag if smoke tests fail.

Use short-lived AWS credentials through CI identity federation rather than
stored AWS access keys.

## 15. Operational Notes

- Static Next.js environment variables prefixed with `NEXT_PUBLIC_` are baked
  into the image at build time. Changing the API URL or Clerk publishable key
  requires a new image build.
- Nginx does not need application secrets.
- The UI task is intentionally separate from the API task so either can deploy
  or scale independently.
- One small Fargate task is enough initially. Add autoscaling only after CPU,
  memory, and request measurements demonstrate a need.
- Keep at least one previous image tag for immediate rollback.
- Configure billing alarms before leaving the service running continuously.
- Treat the ChatGPT Site and AWS-hosted UI as separate deployments; publishing
  one does not update the other.

## 16. Implementation Order Summary

1. Initialize Git and commit the current source.
2. Convert Vinext to a static Next.js export.
3. Remove the server-side Trominos proxy.
4. Switch browser requests to `https://api.trominos.com`.
5. Verify Clerk authentication and backend CORS locally.
6. Add the multi-stage Dockerfile, Nginx configuration, and `.dockerignore`.
7. Build and test the Linux AMD64 container locally.
8. Implement and validate the independent Terraform stack.
9. Apply infrastructure with zero ECS tasks.
10. Build and push an immutable image to ECR.
11. Apply Terraform with one ECS task.
12. Test the raw API Gateway endpoint.
13. Cut over `app.trominos.com`.
14. Run the complete acceptance suite.
15. Retain the ChatGPT Site and previous image during the stabilization period.
16. Add CI/CD after the manual deployment is proven.

## 17. Definition of Done

The implementation is complete when:

- The UI source is tracked in Git.
- `npm run build` produces a static export.
- The Linux AMD64 Nginx image builds reproducibly.
- Terraform creates only UI-owned AWS resources.
- `https://app.trominos.com` serves the Nginx-hosted UI with valid TLS.
- Clerk sign-in and organization authorization work.
- Real image analysis works against `https://api.trominos.com`.
- Logs, health checks, rollback, and cost-stop procedures are documented and
  tested.
- No secrets are embedded in the image or frontend bundle.
- The previous ChatGPT Site remains available until the new deployment is
  explicitly accepted for production use.
