# AIRIS UI: ChatGPT Preview to AWS Production

## Purpose

Establish a repeatable UI delivery workflow with two clearly separated stages:

1. Build and review UI changes on the private ChatGPT-hosted AIRIS Site.
2. Promote the exact accepted product changes into the production Docker image
   and deploy that immutable image to AWS ECS.

This document is a plan. It does not make a Site publication, source change,
container push, Terraform apply, or DNS change.

## Environments

| Environment | URL | Purpose | Access |
|---|---|---|---|
| ChatGPT preview | `https://airis-vision-governance.airis-9777.chatgpt.site` | UI iteration and stakeholder validation | Owner-only |
| Local production candidate | `http://localhost:3000` | Verify the Nginx container against the production API | Developer machine |
| AWS production | `https://app.trominos.com` | Live AIRIS application | Clerk-authenticated users |
| Backend API | `https://api.trominos.com` | Shared API used by preview, local, and production UI | Clerk JWT or approved API key |

The ChatGPT Site remains a preview environment. Passing review there does not
automatically publish to AWS.

## Core source-control decision

The Git repository at `/Users/tojojose/trominos/airis-ui` is the production
source of truth. It owns:

- Production-compatible Next.js configuration.
- Static export behavior.
- Dockerfile and Nginx configuration.
- Dependency lockfile.
- Production documentation and plans.

The ChatGPT Site repository is a design and validation workspace. It owns its
Sites-specific hosting metadata and preview publication history.

Do not blindly replace the production repository with the complete Sites
checkout. Promote the accepted application changes through a reviewed Git
branch. This prevents Sites-only Vinext, Cloudflare, runtime, or hosting files
from breaking the static Nginx build.

## Files that may be promoted

Normally promote changes from these product surfaces:

- `app/**/*.tsx`
- `app/**/*.css`
- Approved assets under `public/`
- User-facing metadata in `app/layout.tsx`
- Required product dependencies, after production compatibility review

Keep these production-owned files unless the change explicitly requires them:

- `Dockerfile`
- `nginx.conf`
- `next.config.ts`
- `.dockerignore`
- `.gitignore`
- Terraform files
- Production README and deployment plans

Never promote these Sites-only items into the production container:

- `.openai/hosting.json`
- Sites credentials or source tokens
- Cloudflare bindings or runtime secrets
- Preview-only environment files
- Generated deployment archives

## Branch and release model

Use one branch for each accepted UI change set:

```text
main
  -> codex/ui-<short-change-name>
       -> preview source imported and adapted
       -> production build validated
       -> merged to main
       -> Docker image tagged with the merge commit SHA
```

Record these identifiers for every release:

- ChatGPT Site version number.
- ChatGPT Site source commit.
- Production Git commit.
- ECR image tag and digest.
- ECS task-definition revision.
- Previous production image tag for rollback.

## Stage 0: one-time workflow preparation

### 0.1 Clean the production repository

Before starting the first UI cycle:

1. Resolve or discard the generated `next-env.d.ts` working-tree difference.
2. Require a clean Git status.
3. Confirm `main` contains the currently deployed production source.
4. Record the currently deployed ECR image tag.

Do not start source promotion from a dirty production checkout.

### 0.2 Preserve private preview access

The ChatGPT Site is currently configured as custom owner-only access. Keep it
that way during UI development:

- Owner remains allowed.
- No workspace groups.
- No tenant groups.
- No external viewers.
- No public access.

Before every preview publication, inspect the Site access policy. Publishing a
new version must preserve owner-only access.

### 0.3 Allow the preview browser origin

The backend currently supports production and local browser origins. Functional
preview testing also needs this exact origin:

```text
https://airis-vision-governance.airis-9777.chatgpt.site
```

Add it to the backend Terraform `cors_origins` value alongside:

```text
https://app.trominos.com
http://localhost:3000
```

This CORS entry allows the browser to send requests; it does not bypass Clerk
authentication or API authorization. Plan and deploy the backend CORS change as
a separate reviewed change because it creates a new API task-definition
revision.

Also verify the Clerk application accepts both preview and production origins
and uses valid redirect URLs for each. Never use a secret Clerk key in browser
code; only the publishable key belongs in the UI build.

## Stage 1: begin a UI change in ChatGPT Sites

1. Start from the latest accepted UI, not an old preview snapshot.
2. Confirm the Site project is the existing `Airis Vision Governance` project;
   never create a duplicate Site for ordinary iterations.
3. Keep access owner-only.
4. Define a small acceptance statement before editing, for example:
   - Navigation change.
   - New result card behavior.
   - Mobile upload improvement.
   - New compliance view.
5. Make only the requested product changes.
6. Preserve the existing API contract and central API URL configuration.

If production has changed since the last Site version, update the preview source
from production before adding new UI work. Resolve drift before design work,
not during promotion.

## Stage 2: preview and validate on the private ChatGPT Site

### 2.1 Build the preview

1. Use the existing Site project and its established framework.
2. Build the smallest meaningful slice first.
3. Open the working preview only after it compiles and renders.
4. Finish the requested interaction, responsive behavior, and error states.
5. Build successfully before publication.

### 2.2 Publish privately

1. Save a Site version from the exact validated source commit.
2. Confirm the current access policy is still owner-only.
3. Deploy with the private Site publication path.
4. Wait for the deployment to succeed.
5. Reuse the existing Site URL; do not create a new slug for each iteration.

### 2.3 Preview acceptance checklist

Validate the changed behavior on the private hosted URL:

- Page loads without runtime errors.
- Clerk sign-in succeeds.
- API requests reach `api.trominos.com` without CORS errors.
- Loading, empty, success, and failure states are understandable.
- Main flow works with keyboard and pointer input.
- Mobile-width layout remains usable.
- No sensitive data appears in browser logs or UI errors.
- Existing navigation and primary workflows still function.
- Service-worker caching does not leave the previous UI visible.

Record explicit acceptance before promotion. If rejected, continue editing the
same private Site and publish another private version. Do not alter AWS.

## Stage 3: promote the accepted Site source into Git

### 3.1 Capture the accepted source

1. Record the accepted Site version and source commit.
2. Obtain a short-lived source repository credential through the Sites hosting
   workflow.
3. Fetch the exact accepted source into an isolated temporary checkout.
4. Never store the credential in a Git remote URL, repository config, shell
   history, Docker layer, or committed file.
5. Expire or discard the credential after source retrieval.

### 3.2 Create the production change branch

1. In `/Users/tojojose/trominos/airis-ui`, start from current `main`.
2. Confirm Git status is clean.
3. Create `codex/ui-<short-change-name>`.
4. Copy or replay only the approved product-source changes.
5. Preserve production infrastructure files.
6. Review every diff before installing dependencies or building.

### 3.3 Resolve framework differences deliberately

The ChatGPT Site and production container may use different build adapters.
During promotion:

- Keep production on standard Next.js static export.
- Do not copy Vinext or Cloudflare build scripts into production.
- Do not add server actions, route handlers, runtime cookies, request-time
  headers, or other server-only features to the static container.
- Keep API calls in browser-safe client components.
- Keep the API base URL behind `app/api-config.ts`.
- Replace Sites runtime bindings with existing HTTPS API calls.
- If the Site change adds a package, add only the package needed by production
  and regenerate `package-lock.json` with the approved Node version.

If an accepted feature cannot work as a static export, stop promotion and make
an architecture decision. Do not silently convert the production container
into a Node server.

## Stage 4: validate the production candidate

### 4.1 Source checks

Run from `/Users/tojojose/trominos/airis-ui`:

1. Install from the lockfile with Node 22.
2. Run lint.
3. Run the static production build.
4. Confirm only static routes are emitted.
5. Review the final Git diff.
6. Confirm no Sites credentials, `.openai` metadata, secrets, Terraform state,
   or local environment files are included.

### 4.2 Build the real production container

Build the same architecture ECS runs:

```text
linux/amd64
```

Compile these browser-safe values into the static build:

```text
NEXT_PUBLIC_TROMINOS_API_URL=https://api.trominos.com
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<approved publishable key>
```

Tag the local candidate separately from an ECR release tag until validation
passes.

### 4.3 Local container acceptance

Run Nginx locally with:

```text
host port 3000 -> container port 8080
```

Validate:

- `/healthz` returns 200 and `ok`.
- `/` returns the expected UI.
- Static assets return 200.
- Missing assets return 404.
- Clerk sign-in succeeds at `http://localhost:3000`.
- API requests have no CORS errors.
- The accepted Site behavior matches the container behavior.
- Nginx cache headers and security headers remain present.
- Refreshing a nested client state does not break the application.

If container behavior differs from the accepted Site, return to the promotion
branch. Do not push the image.

## Stage 5: approve and merge

1. Commit the production-compatible source changes on the promotion branch.
2. Review the branch diff.
3. Merge only after the production container passes validation.
4. Use the resulting `main` commit SHA as the immutable image tag.
5. Never deploy `latest`.

The accepted Site commit and production commit may differ because hosting
adapter changes are intentionally excluded. The release record must link them.

## Stage 6: push the immutable image

1. Sign Docker into:

```text
383762989543.dkr.ecr.us-east-1.amazonaws.com/airis-ui
```

2. Build and push `linux/amd64` from clean `main`.
3. Tag the image with the 12-character Git commit SHA.
4. Verify the tag exists in ECR.
5. Record the image digest.
6. Check the ECR scan result before production deployment.

Do not rebuild the same immutable tag. A source change requires a new commit and
new tag.

## Stage 7: deploy through the shared Terraform stack

Terraform is owned by:

```text
/Users/tojojose/trominos/airis/terraform
```

Create a saved plan with:

```text
ui_image_tag=<new Git SHA>
ui_desired_count=1
ui_manage_dns=true
```

Inspect the plan before applying it. A normal UI-only release should show:

- One new UI task-definition revision.
- One in-place UI ECS service update.
- Deregistration of the previous Terraform-managed UI task-definition revision.
- No DNS change.
- No API task-definition change.
- No Cloud Map replacement.
- No certificate, VPC Link, security-group, knowledge-base, S3, or DynamoDB
  change.

Stop if the plan includes unrelated backend or DNS changes.

Apply only the saved, reviewed plan.

## Stage 8: production verification

### 8.1 Infrastructure checks

- ECS service status is active.
- Desired task count is 1.
- Running task count reaches 1.
- Pending task count returns to 0.
- Latest deployment uses the expected image tag.
- Cloud Map has a healthy UI registration on port 8080.

### 8.2 Public checks

- `https://app.trominos.com/healthz` returns 200 and `ok`.
- `https://app.trominos.com` loads through the ACM wildcard certificate.
- Clerk sign-in succeeds.
- Dashboard API calls succeed without CORS errors.
- The accepted UI change is visible.
- Core unchanged workflows still operate.
- `https://api.trominos.com/healthz` remains healthy.

Keep the accepted ChatGPT Site version available during the production
verification window so it can be used as a visual reference.

## Rollback

Record the previous working ECR image tag before every deployment.

If production validation fails:

1. Create a Terraform plan using the previous UI image tag.
2. Keep `ui_desired_count=1` and `ui_manage_dns=true`.
3. Verify the plan changes only the UI task definition and service.
4. Apply the reviewed rollback plan.
5. Wait for ECS stability.
6. Recheck the public health endpoint and UI.

Do not roll DNS back to ChatGPT Sites for an ordinary application regression.
Use the previous immutable ECS image. DNS rollback is reserved for an AWS
hosting failure that cannot be resolved by image rollback.

## Failed-preview and failed-promotion rules

- Failed ChatGPT preview: fix or restore a previous private Site version; AWS is
  untouched.
- Rejected design: do not create a production branch.
- Promotion build failure: fix on the production branch or return to Sites;
  never push a failing image.
- ECR push failure: keep production on its current image.
- Terraform plan contains unrelated changes: stop and resolve worktree/state
  drift before applying.
- ECS deployment failure: let the deployment circuit breaker act, then verify
  and explicitly roll back to the previous image if needed.

## Repeated release checklist

For each UI iteration:

1. Confirm production and preview baselines.
2. Implement in the owner-only ChatGPT Site.
3. Publish privately.
4. Validate and explicitly accept the preview.
5. Record Site version and source commit.
6. Create a clean production promotion branch.
7. Promote only approved product-source changes.
8. Validate static export.
9. Build and test the Nginx container locally on port 3000.
10. Merge and tag with the production Git SHA.
11. Push the immutable image to ECR.
12. Review a UI-only Terraform plan.
13. Apply and wait for ECS stability.
14. Validate `app.trominos.com` and `api.trominos.com`.
15. Record release and rollback identifiers.

## Suggested later automation

Automate only after several manual releases prove the workflow:

- A GitHub pull-request check for lint, static export, and Docker build.
- A secret and forbidden-file check for Sites metadata and credentials.
- An ECR build-and-push job triggered by an approved main-branch commit.
- A manually approved production deployment job using the immutable image tag.
- Post-deployment health checks and automatic rollback trigger.

Do not automate ChatGPT Site acceptance. Human approval of the private preview
remains the promotion gate.

## Definition of done

A UI release is complete only when:

- The private ChatGPT Site version was accepted.
- Its source version is traceable to the production Git change.
- The production static build and Nginx container passed locally.
- The immutable image exists in ECR with a recorded digest.
- Terraform changed only the expected UI task definition and ECS service.
- The ECS service is stable with one running task.
- `https://app.trominos.com` passes authentication and API-flow checks.
- The previous working image tag is recorded and can be restored.
