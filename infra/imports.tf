# Resources created before Terraform was introduced. Delete this file once the import is applied.
import {
  to = azurerm_resource_group.main
  id = "/subscriptions/${var.subscription_id}/resourceGroups/${var.resource_group_name}"
}
