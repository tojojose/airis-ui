resource "aws_service_discovery_private_dns_namespace" "ui" {
  name        = "${var.project_name}.local"
  description = "Private service discovery for the Airis UI"
  vpc         = data.aws_vpc.default.id
}

resource "aws_service_discovery_service" "ui" {
  name = "ui"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.ui.id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "SRV"
    }
  }

  health_check_custom_config {}
}
