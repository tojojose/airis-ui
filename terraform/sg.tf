resource "aws_security_group" "vpc_link" {
  name        = "${var.project_name}-vpclink"
  description = "API Gateway VPC Link ENIs for the Airis UI"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_security_group" "task" {
  name        = "${var.project_name}-task"
  description = "Airis UI Fargate task"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_egress_rule" "vpc_link_to_ui" {
  security_group_id            = aws_security_group.vpc_link.id
  description                  = "HTTP to the Airis UI task"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = aws_security_group.task.id
}

resource "aws_vpc_security_group_ingress_rule" "ui_from_vpc_link" {
  security_group_id            = aws_security_group.task.id
  description                  = "HTTP from API Gateway VPC Link only"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = aws_security_group.vpc_link.id
}

resource "aws_vpc_security_group_egress_rule" "ui_all" {
  security_group_id = aws_security_group.task.id
  description       = "Outbound access for ECR image startup and CloudWatch logs"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
