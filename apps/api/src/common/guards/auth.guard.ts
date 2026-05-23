import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { auth } from "../../auth/auth.config";

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      throw new UnauthorizedException("Not authenticated");
    }

    request.user = session.user;
    request.session = session.session;
    return true;
  }
}
