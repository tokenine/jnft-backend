import * as modulesType from "./module.d.ts";
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import Package, { version, latestUpdate } from './package.json';

dotenv.config();

const PORT = process.env.PORT || 3000;
const app: Express = express();

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.all('/', cors(), (req: Request, res: Response) => {
  const client = { "user-agent": req.headers?.['user-agent'], "origin": req.headers?.origin }
  if (req.method === "POST" && req.body.full) {
    return res.json({ ...Package, client });
  }
  return res.json({ version, latestUpdate, client });
});

app.listen(PORT, () => {
  const now = new Date();
  console.log(`
  =============================
    App version ${version}
    ⚡Starting at 🕰️  ${now.toUTCString()} (${now.toISOString()})
    ⚡Using port ${PORT}
    ${Intl.DateTimeFormat().resolvedOptions().timeZone}
  =============================`
  )
});
