export function log(message: string, source = "express") {
  // Use America/Los_Angeles timezone (PST/PDT)
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}


