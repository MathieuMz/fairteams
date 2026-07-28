import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import { register as registerCompetitions } from "./routes/competitions";
import { register as registerPlayers } from "./routes/players";
import { register as registerConstraints } from "./routes/constraints";
import { register as registerSnapshots } from "./routes/snapshots";
import { register as registerRebalance } from "./routes/rebalance";

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors, {
    origin: ["http://localhost:3000", "https://fairteams.onrender.com"],
    allowedHeaders: ["Content-Type"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  await registerCompetitions(app);
  await registerPlayers(app);
  await registerConstraints(app);
  await registerSnapshots(app);
  await registerRebalance(app);

  await app.listen({ port: Number(process.env.PORT ?? 3001), host: "0.0.0.0" });
}

main();
