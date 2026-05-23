import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().organizationId;
  },
);
