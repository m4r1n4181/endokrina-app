#!/bin/bash
# Runs INSIDE the LocalStack container. Host Windows/Git Bash does not have `awslocal`.
set -eu
BUCKET="${STORAGE_BUCKET:-endokrina-documents}"
awslocal s3 mb "s3://${BUCKET}" 2>/dev/null || true
awslocal s3 ls
echo "LocalStack S3 bucket ready: ${BUCKET}"
