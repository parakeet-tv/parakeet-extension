import PartySocket from "partysocket";

const ws = new PartySocket({
  host: "localhost:1999", // or localhost:1999 or project-name.username.partykit.dev in dev
  room: "my-room",
  // add an optional id to identify the client,
  // if not provided, a random id will be generated
  // note that the id needs to be unique per connection,
  // not per user, so e.g. multiple devices or tabs need a different id
  id: "myclientid",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  //   WebSocket: WS,

  // optionally, specify the party to connect to.
  // if not provided, will connect to the "main" party defined in partykit.json
  party: "main",
});

ws.addEventListener("error", (ev) => {
  console.error(`err:`, ev);
});

ws.addEventListener("close", (ev) => {
  console.info(`close:`, ev);
});

ws.addEventListener("message", (ev) => {
  console.info(`message:`, ev);
});

ws.addEventListener("open", (ev) => {
  console.info(`open:`, ev);
});

export { ws };

// optionally, update the properties of the connection
// (e.g. to change the host or room)
// ws.updateProperties({
//   room: "my-new-room",
// });

// ws.reconnect(); // make sure to call reconnect() after updating the properties
