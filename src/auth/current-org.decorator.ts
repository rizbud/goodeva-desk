import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Organization } from '../../generated/prisma/client.js';

export const CurrentOrg = createParamDecorator(
  (data: keyof Organization | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const organization = request.organization;

    return data ? organization?.[data] : organization;
  },
);
