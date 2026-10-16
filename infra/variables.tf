variable "subscription_id" {
  type        = string
  description = "Azure subscription ID."
}

variable "project" {
  type        = string
  description = "Project name, used in tags."
  default     = "endokrina"
}

variable "environment" {
  type        = string
  description = "Environment name, used in tags."
  default     = "prod"
}

variable "location" {
  type        = string
  description = "Azure region for resources."
  default     = "swedencentral"
}

variable "resource_group_name" {
  type        = string
  description = "Name of the application resource group."
}

variable "resource_group_location" {
  type        = string
  description = "Region of the resource group. Defaults to var.location."
  default     = null
}
