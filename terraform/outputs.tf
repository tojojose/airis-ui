output "ui_url" {
  description = "Stable UI URL after DNS cutover."
  value       = "https://${var.domain_name}"
}

output "execute_api_url" {
  description = "Raw API Gateway URL for validation before DNS cutover."
  value       = aws_apigatewayv2_api.ui.api_endpoint
}

output "ecr_repository_url" {
  description = "ECR repository used for immutable Airis UI images."
  value       = aws_ecr_repository.ui.repository_url
}

output "cluster_name" {
  value = aws_ecs_cluster.ui.name
}

output "service_name" {
  value = aws_ecs_service.ui.name
}

output "log_group" {
  value = aws_cloudwatch_log_group.ui.name
}

output "dns_managed" {
  value = var.manage_dns
}
