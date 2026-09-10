import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

export const unhandledErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  req.log.error(
    {
      err,
      companyId: req.user?.companyId ?? null,
      userId: req.user?.id ?? null,
    },
    "Unhandled request error",
  );

  res.status(500).json({
    error: "Internal server error",
  });
};

app.use(unhandledErrorHandler);

export default app;