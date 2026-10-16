# Infrastructure

Terraform configuration for the Azure resources that run Endokrina. Terraform owns the infrastructure; the application image is deployed by [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

Requirements: Terraform >= 1.10, Azure CLI, Owner role on the subscription.

## State backend

State is stored in an Azure Storage account that Terraform itself does not manage. Create it once per subscription (the storage account name must be globally unique):

```sh
az provider register --namespace Microsoft.Storage --wait
az group create -n endokrina-tfstate-rg -l swedencentral
az storage account create -n <account> -g endokrina-tfstate-rg -l swedencentral --sku Standard_LRS --min-tls-version TLS1_2 --allow-blob-public-access false --allow-shared-key-access false
az storage account blob-service-properties update --account-name <account> -g endokrina-tfstate-rg --enable-versioning true --enable-delete-retention true --delete-retention-days 30
az role assignment create --assignee "$(az ad signed-in-user show --query id -o tsv)" --role "Storage Blob Data Contributor" --scope "$(az storage account show -n <account> --query id -o tsv)"
az storage container create -n tfstate --account-name <account> --auth-mode login
```

The role assignment can take a few minutes to apply; retry the last command if it returns 403. Grant the same role to the CI identity if a pipeline runs Terraform.

Copy `backend.hcl.example` to `backend.hcl` and fill in the values.

## Usage

```sh
cp terraform.tfvars.example terraform.tfvars
terraform init "-backend-config=backend.hcl"
terraform plan -out tfplan
terraform apply tfplan
```

`imports.tf` only applies to the original deployment, where resources existed before Terraform. Delete it when deploying to a new subscription.

## Not managed here

- S3 bucket and AWS credentials for document storage
- Resend (SMTP)
- GitHub Actions secrets
