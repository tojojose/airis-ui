resource "aws_route53_record" "ui" {
  count = var.manage_dns ? 1 : 0

  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.ui.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.ui.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
