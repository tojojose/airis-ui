# AIRIS UI

Static Next.js UI for AIRIS, built into an unprivileged Nginx container and
deployed to AWS ECS Fargate with Terraform.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

The browser UI calls `NEXT_PUBLIC_TROMINOS_API_URL` directly. The default is
`https://api.trominos.com`.

## Verify a production build

```bash
npm run lint
npm run build

docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_TROMINOS_API_URL=https://api.trominos.com \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" \
  --load \
  -t airis-ui:local .

docker run --rm -p 8080:8080 airis-ui:local
```

Open `http://localhost:8080`. The container health endpoint is
`http://localhost:8080/healthz`.

## AWS deployment

The Terraform stack is intentionally independent from the AIRIS API stack.
Bootstrap it with no running task and no DNS change:

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Get the ECR URL from `terraform output -raw ecr_repository_url`, sign Docker in
to ECR, and push an immutable image tag (normally the Git commit SHA):

```bash
TAG="$(git rev-parse --short=12 HEAD)"
ECR_URL="$(terraform output -raw ecr_repository_url)"

aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin "${ECR_URL%%/*}"

docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_TROMINOS_API_URL=https://api.trominos.com \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" \
  --tag "$ECR_URL:$TAG" \
  --push .
```

Start one task without changing DNS:

```bash
terraform apply -var="image_tag=$TAG" -var="desired_count=1" -var="manage_dns=false"
```

Verify the raw URL from `terraform output -raw execute_api_url`. Only after it
passes should DNS be switched:

```bash
terraform apply -var="image_tag=$TAG" -var="desired_count=1" -var="manage_dns=true"
```

This last command makes `https://app.trominos.com` point to the new UI stack.
Review the plan before every apply. Do not run it until the existing hosted UI
can be safely replaced.

The full design and rollback plan are in [plans/plans.md](plans/plans.md).
