export function assertSafeDevDatabase(env: NodeJS.ProcessEnv): URL {
  if (env.NODE_ENV !== "development") {
    throw new Error("Refusing to seed unless NODE_ENV=development");
  }
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required");
  const target = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error("DATABASE_URL must use postgres or postgresql");
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!localHosts.has(target.hostname)) {
    throw new Error("Refusing to seed a non-loopback database host");
  }
  if (target.pathname !== "/nagi_dev") {
    throw new Error("Refusing to seed a database other than nagi_dev");
  }
  return target;
}
