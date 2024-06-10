import { preHandlerAsyncHookHandler } from "fastify";
import { RateLimiterOptions } from "./";

declare module "fastify" {
	interface FastifyInstance {
		rateLimiter: (options?: RateLimiterOptions) => preHandlerAsyncHookHandler;
	}
	interface FastifyContextConfig {
		rateLimiter?: RateLimiterOptions | false;
	}
}
