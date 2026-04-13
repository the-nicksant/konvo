// src/channels/whatsapp/adapter.ts
function whatsapp(config) {
  return new WhatsAppAdapter(config);
}
var WhatsAppAdapter = class {
  constructor(config) {
    this.config = config;
  }
  config;
  parseInbound(_rawPayload) {
    throw new Error("Not yet implemented");
  }
  async sendOutbound(_to, _message) {
    throw new Error("Not yet implemented");
  }
};

export { WhatsAppAdapter, whatsapp };
