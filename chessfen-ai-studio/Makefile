.DEFAULT_GOAL := help

help:
	@echo "Available commands:"
	@echo "  make docker_build        - Build the Docker image"
	@echo "  make docker_run          - Run the Docker container"
	@echo "  make docker_stop        - Stop the Docker container"
	@echo "  make docker_auth         - Authenticate to the Docker registry"
	@echo "  make docker_create_repo  - Create the Docker repository"
	@echo "  make docker_image_create - Create the Docker image"
	@echo "  make docker_push_all     - Push the Docker image to the registry"
	@echo "  make docker_launch       - Launch the Docker container"

docker_build:
	@docker build --tag=chessfen-mvp .

docker_run:
	@docker run -it --rm -e PORT=8000 -p 8000:8000 --env-file .env chessfen-mvp

docker_stop:
	@docker stop chessfen-mvp

docker_auth:
	@gcloud auth configure-docker europe-west1-docker.pkg.dev

docker_create_repo:
	@gcloud artifacts repositories create chessfen-mvp --repository-format=docker \
	--location=europe-west1 --description="Repository for storing chessfen-mvp images"

docker_image_create:
	@docker build \
  --platform linux/amd64 \
  -t europe-west1-docker.pkg.dev/le-wagon-bootcamp-475008/chessfen-mvp/chessfen:prod .

docker_push_all:
	@docker push europe-west1-docker.pkg.dev/le-wagon-bootcamp-475008/chessfen-mvp/chessfen:prod

docker_launch:
	@gcloud run deploy --image europe-west1-docker.pkg.dev/le-wagon-bootcamp-475008/chessfen-mvp/chessfen:prod --memory 4Gi --region europe-west1 --env-vars-file .env.yaml