/** Real-shaped Meta webhook payloads for testing */

export const textMessagePayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
            contacts: [{ profile: { name: "Maria Silva" }, wa_id: "5511999887766" }],
            messages: [
              {
                from: "5511999887766",
                id: "wamid.text001",
                timestamp: "1736000000",
                type: "text",
                text: { body: "quero remarcar minha consulta" },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const buttonReplyPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
            contacts: [{ profile: { name: "Maria Silva" }, wa_id: "5511999887766" }],
            messages: [
              {
                from: "5511999887766",
                id: "wamid.btn001",
                timestamp: "1736000100",
                type: "interactive",
                interactive: {
                  type: "button_reply",
                  button_reply: { id: "confirm", title: "Yes" },
                },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const listReplyPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
            contacts: [{ profile: { name: "Maria Silva" }, wa_id: "5511999887766" }],
            messages: [
              {
                from: "5511999887766",
                id: "wamid.list001",
                timestamp: "1736000200",
                type: "interactive",
                interactive: {
                  type: "list_reply",
                  list_reply: { id: "slot_14h", title: "14:00 — Dr. Santos" },
                },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const imagePayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
            contacts: [{ profile: { name: "Maria Silva" }, wa_id: "5511999887766" }],
            messages: [
              {
                from: "5511999887766",
                id: "wamid.img001",
                timestamp: "1736000300",
                type: "image",
                image: { id: "media_img_001", caption: "my prescription" },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

export const locationPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
            contacts: [{ profile: { name: "Maria Silva" }, wa_id: "5511999887766" }],
            messages: [
              {
                from: "5511999887766",
                id: "wamid.loc001",
                timestamp: "1736000400",
                type: "location",
                location: { latitude: "-23.5505", longitude: "-46.6333" },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

/** Status update — not a user message, adapter must return null */
export const statusUpdatePayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
            statuses: [
              {
                id: "wamid.status001",
                status: "delivered",
                timestamp: "1736000500",
                recipient_id: "5511999887766",
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};
