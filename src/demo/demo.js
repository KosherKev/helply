"use strict";
/** Fictional demo merchant ("KwikPay Shop"). Only used when DEMO_MODE=true. */

const DEMO_USERS = [
  { id: "usr_demo_ama", name: "Ama Mensah" },
  { id: "usr_demo_kofi", name: "Kofi Boateng" },
];

const DEMO_KNOWLEDGE = [
  {
    title: "Delivery",
    text: "Orders within Greater Accra are delivered in 1 to 3 working days. Orders to other regions take 3 to 6 working days.\n\nDelivery is free for orders above GHS 300. Otherwise the delivery fee is GHS 20 in Accra and GHS 35 elsewhere.",
  },
  {
    title: "Payments",
    text: "We accept MTN MoMo, Vodafone Cash, AirtelTigo Money and bank cards.\n\nIf a payment fails, do not pay twice. Wait 10 minutes and check your order status before trying again.",
  },
  {
    title: "Returns and refunds",
    text: "You can return an item within 7 days of delivery if it is unused and in its original packaging.\n\nRefunds are paid to the original payment method within 3 to 5 working days after we receive the item.",
  },
  {
    title: "Support hours",
    text: "Customer support is available Monday to Saturday, 8am to 6pm. Our shop in Osu is open Monday to Saturday, 9am to 7pm.",
  },
  {
    title: "Account safety",
    text: "To reset your password, tap Forgot password on the sign-in screen. We never ask for your password, PIN or one-time code.",
  },
];

const seedDemoKnowledge = (store) => DEMO_KNOWLEDGE.forEach((d) => store.addKnowledge(d));

module.exports = { DEMO_USERS, seedDemoKnowledge };
