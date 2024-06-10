import { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import fp from "fastify-plugin";
import { RateLimiterRedis, RateLimiterMemory, IRateLimiterStoreOptions, RateLimiterRes } from "rate-limiter-flexible";
import Redis from "ioredis";
import { ApplicationHook, LifecycleHook } from "fastify/types/hooks";

interface RateLimiterOptions {
	redis?: Redis;
	redisConfig?: {
		host: string;
		port: number;
		password?: string;
		db?: number;
	};
	points: number;
	duration: number;
	keyPrefix?: string;
	headers?: boolean;
	storeType?: "memory" | "redis";
	maxQueue?: number;
	whiteList?: (req: FastifyRequest) => boolean;
	errorHandler?: (
		req: FastifyRequest,
		res: FastifyReply,
		next: HookHandlerDoneFunction,
		rateLimiterRes: RateLimiterRes
	) => void;
	global?: boolean;
	max?: number;
	ban?: number;
	timeWindow?: number;
	hook?: string;
	cache?: number;
	allowList?: string[];
	nameSpace?: string;
	continueExceeding?: boolean;
	skipOnError?: boolean;
	keyGenerator?: (req: FastifyRequest) => string;
	errorResponseBuilder?: (req: FastifyRequest, context: any) => any;
	enableDraftSpec?: boolean;
	addHeadersOnExceeding?: {
		"x-ratelimit-limit"?: boolean;
		"x-ratelimit-remaining"?: boolean;
		"x-ratelimit-reset"?: boolean;
	};
	addHeaders?: {
		"x-ratelimit-limit"?: boolean;
		"x-ratelimit-remaining"?: boolean;
		"x-ratelimit-reset"?: boolean;
		"retry-after"?: boolean;
	};
}

async function rateLimiterPlugin(fastify: FastifyInstance, options: RateLimiterOptions) {
	let rateLimiter: RateLimiterRedis | RateLimiterMemory;

	if (options.storeType === "redis" && (options.redis || options.redisConfig)) {
		const redisClient =
			options.redis ||
			new Redis({
				host: options.redisConfig?.host,
				port: options.redisConfig?.port,
				password: options.redisConfig?.password,
				db: options.redisConfig?.db,
			});

		rateLimiter = new RateLimiterRedis({
			storeClient: redisClient,
			points: options.points,
			duration: options.duration,
			keyPrefix: options.keyPrefix || "rate-limiter",
		} as IRateLimiterStoreOptions);
	} else {
		rateLimiter = new RateLimiterMemory({
			points: options.points,
			duration: options.duration,
			keyPrefix: options.keyPrefix || "rate-limiter",
		});
	}

	fastify.decorate("rateLimiter", rateLimiter);

	fastify.addHook(
		(options.hook as ApplicationHook | LifecycleHook) || "onRequest",
		async (request: FastifyRequest, reply: FastifyReply) => {
			try {
				if (options.whiteList && options.whiteList(request)) {
					return;
				}

				const rateLimiterRes = await rateLimiter.consume(
					options.keyGenerator ? options.keyGenerator(request) : request.ip
				);

				if (options.headers) {
					reply.header("X-RateLimit-Limit", options.points);
					reply.header("X-RateLimit-Remaining", rateLimiterRes.remainingPoints);
					reply.header("X-RateLimit-Reset", new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());
				}
			} catch (rejRes) {
				const rateLimiterRes = rejRes as RateLimiterRes;

				if (options.headers) {
					reply.header("X-RateLimit-Limit", options.points);
					reply.header("X-RateLimit-Remaining", 0);
					reply.header("X-RateLimit-Reset", new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());
					if (options.addHeaders?.["retry-after"]) {
						reply.header("Retry-After", Math.ceil(rateLimiterRes.msBeforeNext / 1000));
					}
				}

				if (options.errorHandler) {
					return options.errorHandler(request, reply, () => {}, rateLimiterRes);
				} else {
					reply.status(429).send(
						options.errorResponseBuilder
							? options.errorResponseBuilder(request, { rateLimiterRes })
							: {
									error: "Too Many Requests",
									message: "You have exceeded the rate limit.",
									rateLimit: {
										remaining: 0,
										reset: rateLimiterRes.msBeforeNext / 1000,
									},
							  }
					);
				}
			}
		}
	);
}

export default fp(rateLimiterPlugin, {
	fastify: "4.x",
	name: "fastify-rate-limiter-flexible",
});
export { RateLimiterOptions, rateLimiterPlugin };
