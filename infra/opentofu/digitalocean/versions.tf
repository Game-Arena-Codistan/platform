terraform {
  required_version = ">= 1.10.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.97"
    }
  }

  # Production and staging must use a remote encrypted backend. The GitHub
  # workflow supplies backend settings from TF_BACKEND_CONFIG_B64.
  backend "s3" {}
}

provider "digitalocean" {}
