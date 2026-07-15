import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Varistor Feedback Engine",
};

// Public page: Meta requires a reachable privacy policy URL before the
// app can be published, and customers who receive our WhatsApp messages
// deserve to see it too — so it sits outside the login gate (proxy.ts).
export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-[720px] px-5 py-12">
      <h1 className="text-[40px] leading-[1.1] font-semibold">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-ink-muted-48">
        Varistor Feedback Engine · Last updated 15 July 2026
      </p>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed">
        <section>
          <h2 className="text-[21px] font-semibold mb-2">Who we are</h2>
          <p>
            The Varistor Feedback Engine is an internal tool operated by
            Varistor to request feedback from customers who recently
            purchased our products. It sends a single WhatsApp message per
            order using the Meta WhatsApp Business API.
          </p>
        </section>

        <section>
          <h2 className="text-[21px] font-semibold mb-2">
            What data we process
          </h2>
          <p>We process the minimum needed to send a feedback request:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Your name (as provided with your order)</li>
            <li>Your phone number</li>
            <li>Your order ID</li>
            <li>
              The delivery status of the message we sent you (sent,
              delivered, read, or failed)
            </li>
          </ul>
          <p className="mt-2">
            We do not collect payment details, addresses, or any other
            personal information in this tool, and we never sell or share
            your data for advertising.
          </p>
        </section>

        <section>
          <h2 className="text-[21px] font-semibold mb-2">
            How your data is used
          </h2>
          <p>
            Your details are used once per order to send you a WhatsApp
            message asking how your purchase went. Each order triggers at
            most one feedback request — our system automatically prevents
            repeat messages for the same order.
          </p>
        </section>

        <section>
          <h2 className="text-[21px] font-semibold mb-2">
            Where your data lives
          </h2>
          <p>
            Data is stored in a secured cloud database and messages are
            delivered through the Meta WhatsApp Business API. Meta
            processes your phone number to deliver the message, as
            described in{" "}
            <a
              href="https://www.whatsapp.com/legal/business-data-transfer-addendum"
              className="text-primary underline"
            >
              WhatsApp&apos;s business terms
            </a>
            . Access to the tool itself is restricted to authorised
            Varistor staff.
          </p>
        </section>

        <section>
          <h2 className="text-[21px] font-semibold mb-2">Opting out</h2>
          <p>
            If you do not want to receive feedback requests, reply to the
            message and tell us — we will add your number to our do-not-
            contact list and you will not be messaged again. You can also
            block the sender in WhatsApp at any time.
          </p>
        </section>

        <section>
          <h2 className="text-[21px] font-semibold mb-2">Contact</h2>
          <p>
            For questions about this policy or to request deletion of your
            data, contact Varistor at{" "}
            <a
              href="mailto:varsap3000@gmail.com"
              className="text-primary underline"
            >
              varsap3000@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
