variable "aws_region" {
  description = "AWS region containing the existing ACM certificate and Route 53 zone."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix used for UI-owned AWS resources."
  type        = string
  default     = "airis-ui"
}

variable "domain_name" {
  description = "Public hostname for the UI."
  type        = string
  default     = "app.trominos.com"
}

variable "zone_name" {
  description = "Existing Route 53 hosted zone."
  type        = string
  default     = "trominos.com"
}

variable "image_tag" {
  description = "Immutable ECR image tag, normally the Git commit SHA."
  type        = string
  default     = "bootstrap"
}

variable "desired_count" {
  description = "Number of Fargate UI tasks. Use zero during ECR bootstrap."
  type        = number
  default     = 0

  validation {
    condition     = var.desired_count >= 0
    error_message = "desired_count must be zero or greater."
  }
}

variable "task_cpu" {
  description = "Fargate CPU units."
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 512
}

variable "container_port" {
  description = "Unprivileged Nginx listen port."
  type        = number
  default     = 8080
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 30
}

variable "manage_dns" {
  description = "Create the app.trominos.com Route 53 alias. Leave false until raw API Gateway validation passes."
  type        = bool
  default     = false
}
