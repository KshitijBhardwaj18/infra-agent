export const BUILDSPEC = `version: 0.2
phases:
  pre_build:
    commands:
      - git clone https://x-access-token:$GITHUB_TOKEN@github.com/$GITHUB_OWNER/$GITHUB_REPO.git /tmp/source
      - cd /tmp/source && git checkout $COMMIT_SHA
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
  build:
    commands:
      - docker build -f /tmp/source/$DOCKERFILE_PATH -t $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG /tmp/source
  post_build:
    commands:
      - docker push $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG
logs:
  cloudwatch:
    status: ENABLED
    group-name: /aws/codebuild/$CODEBUILD_PROJECT_NAME
    stream-name: $CODEBUILD_BUILD_ID
`;
