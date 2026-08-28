resource "aws_apigatewayv2_api" "ui" {
  name          = var.project_name
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_vpc_link" "ui" {
  name               = var.project_name
  subnet_ids         = data.aws_subnets.public.ids
  security_group_ids = [aws_security_group.vpc_link.id]
}

resource "aws_apigatewayv2_integration" "ui" {
  api_id                 = aws_apigatewayv2_api.ui.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = aws_service_discovery_service.ui.arn
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.ui.id
  payload_format_version = "1.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.ui.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.ui.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.ui.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_domain_name" "ui" {
  domain_name = var.domain_name

  domain_name_configuration {
    certificate_arn = data.aws_acm_certificate.wildcard.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "ui" {
  api_id      = aws_apigatewayv2_api.ui.id
  domain_name = aws_apigatewayv2_domain_name.ui.id
  stage       = aws_apigatewayv2_stage.default.id
}
