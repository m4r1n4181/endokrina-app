locals {
  resource_group_location = coalesce(var.resource_group_location, var.location)

  tags = {
    project     = var.project
    environment = var.environment
    managed-by  = "terraform"
  }
}
