const express = require("express");
const axios = require("axios");
const { Transform } = require("stream");
const { spawn } = require("child_process");

// Check environment variables
if (!process.env.HDHR_IP) {
  console.error("Error: HDHR_IP environment variable not set");
  process.exit(1);
}

if (!process.env.FFMPEG_ARGS) {
  console.error("Error: FFMPEG_ARGS environment variable not set");
  process.exit(1);
} else {
  console.log(`FFMPEG_ARGS: ${process.env.FFMPEG_ARGS}`);
}

const app = express();
const media = express();

const hdhr = process.env.HDHR_IP;
const ffmpegArgs = process.env.FFMPEG_ARGS;
let deviceId = "00ABCDEF";

app.use("/", (req, res, next) => {
  console.log(`App Request: ${req.url}`);
  next();
});

media.use("/", (req, res, next) => {
  console.log(`Media Request: ${req.url}`);
  next();
});

app.use("/", async (req, res, next) => {
  try {
    const response = await axios.get(`http://${hdhr}${req.url}`, {
      responseType: "stream",
    });

    // Copy headers except content-length
    Object.keys(response.headers).forEach(key => {
      if (key.toLowerCase() !== "content-length") {
        res.setHeader(key, response.headers[key]);
      }
    });

    const host = req.headers.host.split(":");

    // Transform the stream
    const transform = new Transform({
      transform(chunk, encoding, callback) {
        this.push(
          chunk
            .toString()
            .replace(new RegExp(deviceId, "g"), deviceId.split("").reverse().join(""))
            .replace(new RegExp(`${hdhr}(?!:)`, "g"), host[1] === "80" ? host[0] : host.join(":"))
            .replace(new RegExp(`${hdhr}:5004`, "g"), `${host[0]}:5004`)
            .replace(/AC4/g, "AC3")
        );
        callback();
      },
    });

    response.data.pipe(transform).pipe(res);
  } catch (error) {
    next(error);
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.sendStatus(500);
});

media.use("/auto/:channel", async (req, res, next) => {
  try {
    const cancelSource = axios.CancelToken.source();

    const stream = await axios.get(`http://${hdhr}:5004/auto/${req.params.channel}`, {
      responseType: "stream",
      cancelToken: cancelSource.token,
    });

    if (stream.status === 200) {
      const ffmpeg = spawn("/usr/local/bin/ffmpeg", [ffmpegArgs], { shell: true });

      stream.data.pipe(ffmpeg.stdin);
      ffmpeg.stdout.pipe(res);

      ffmpeg.on("spawn", () => {
        console.debug(`Tuning channel ${req.params.channel}`);
      });

      res.on("error", () => {
        console.log(`Response error. Stopping ${req.params.channel}`);
        cancelSource.cancel();
      });

      res.on("close", () => {
        console.log(`Response disconnected. Stopping ${req.params.channel}`);
        cancelSource.cancel();
      });
    } else {
      console.error(`Error: ${stream.status}`);
      res.sendStatus(stream.status);
    }
  } catch (error) {
    next(error);
  }
});

// Error handler for media
media.use((err, req, res, next) => {
  console.error(err.stack);
  res.sendStatus(500);
});

// Fetch the device ID and start the servers
axios
  .get(`http://${hdhr}/discover.json`)
  .then(response => {
    deviceId = response.data.DeviceID;
    console.log(`Device ID: ${deviceId}`);
    if (!deviceId) throw new Error("No device ID found");
  })
  .then(() => {
    app.listen(80, () => {
      console.log("App server listening on port 80");
    });

    media.listen(5004, () => {
      console.log("Media server listening on port 5004");
    });
  })
  .catch(err => {
    console.error("Error initializing server:", err);
    process.exit(1);
  });
