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

docker run --rm -p 3000:8080 airis-ui:local
```

Open `http://localhost:3000`. The container health endpoint is
`http://localhost:3000/healthz`. Port 3000 matches the backend's allowed local
CORS origin; Nginx still listens on port 8080 inside the container.

## AWS deployment

AWS resources are managed by the shared Terraform stack at
`/Users/tojojose/trominos/airis/terraform`. Do **not** apply the legacy
`airis-ui/terraform` directory; it is retained temporarily for migration
reference only.

The shared stack reuses the live ECS cluster, VPC Link, Cloud Map namespace,
execution role, wildcard ACM certificate, and Route 53 zone. Its UI defaults
are deliberately safe: zero running tasks and DNS management disabled.

After a reviewed bootstrap apply creates the UI ECR repository, get its URL
from the shared stack, sign Docker in, and push an immutable Git-SHA tag:

```bash
TAG="$(git rev-parse --short=12 HEAD)"
ECR_URL="$(terraform -chdir=/Users/tojojose/trominos/airis/terraform output -raw ui_ecr_repository_url)"

aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin "${ECR_URL%%/*}"

docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_TROMINOS_API_URL=https://api.trominos.com \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" \
  --tag "$ECR_URL:$TAG" \
  --push .
```

Start one task without changing DNS only after the image exists:

```bash
terraform -chdir=/Users/tojojose/trominos/airis/terraform plan \
  -var="ui_image_tag=$TAG" \
  -var="ui_desired_count=1" \
  -var="ui_manage_dns=false"
```

Review that plan before applying it. Verify the raw URL from
`terraform output -raw ui_execute_api_url`. Only after it passes should the
existing Vercel CNAME be cut over through a separately reviewed DNS plan.

The implementation, deployment sequence, DNS cutover, and rollback plan are in
[plans/plan_ui_aws.md](plans/plan_ui_aws.md).
