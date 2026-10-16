resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = local.resource_group_location
  tags     = local.tags

  lifecycle {
    prevent_destroy = true
  }
}
