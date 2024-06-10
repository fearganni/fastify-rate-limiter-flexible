import { RateLimiterRedis, RateLimiterMemory } from "rate-limiter-flexible";
import { RateLimiterOptions } from "./index"; // Adjust the path if needed

declare module "fastify" {
	interface FastifyInstance {
		rateLimiter: RateLimiterRedis | RateLimiterMemory;
	}
	interface FastifyContextConfig {
		rateLimiter?: RateLimiterOptions | false;
	}
}
