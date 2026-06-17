import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { PrismaClient } from "@heizen/db";
import { PRISMA } from "../prisma/prisma.module";
import { AuthGuard } from "../common/guards/auth.guard";

// NOT under /api/auth/* — that prefix is owned by better-auth's catch-all
// handler in main.ts (toNodeHandler(auth)) and would intercept requests
// before they reach this Nest controller.
@Controller("api/me-with-role")
@UseGuards(AuthGuard)
export class AuthExtendedController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  async meWithRole(@Req() req: Request & { user: { id: string } }) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        systemRole: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
      systemRole: user.systemRole,
    };
  }
}
