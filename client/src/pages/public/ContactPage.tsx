import { InfoPage } from "../../components/landing/InfoPage";
import { Icon, type IconName } from "../../components/shared/Icon";
import { SITE, telHref } from "../../config/site";

const CHANNELS: { icon: IconName; title: string; text: string; email: string; subject: string }[] = [
  {
    icon: "mail",
    title: "General enquiries",
    text: "Questions about the platform, partnerships or media.",
    email: SITE.contact.general,
    subject: "Enquiry",
  },
  {
    icon: "database",
    title: "Data and research",
    text: "Requests for data, corrections to a boundary or dataset, and research collaboration.",
    email: SITE.contact.data,
    subject: "Data request",
  },
  {
    icon: "alert",
    title: "Report a problem",
    text: "Something not working, or a figure that looks wrong? Tell us the page, what you expected and what you saw.",
    email: SITE.contact.support,
    subject: "Problem report",
  },
  {
    icon: "shield",
    title: "Privacy and your data",
    text: "Requests to see, correct or delete the personal data we hold about you.",
    email: SITE.contact.privacy,
    subject: "Privacy request",
  },
];

/** How to reach the team, by purpose, with the emergency number first. */
export function ContactPage() {
  return (
    <InfoPage
      eyebrow="Contact"
      title="Contact us"
      lead={`Choose the address that fits your message and we'll reply within ${SITE.responseDays} working days.`}
      sections={[
        {
          id: "emergency",
          title: "In an emergency",
          body: (
            <div className="contact-emergency" role="note">
              <Icon name="phone" size={20} />
              <p>
                If anyone is in danger, call <a href={`tel:${SITE.emergencyNumber}`}>{SITE.emergencyNumber}</a>, Nigeria's free national emergency
                number. This platform and its inboxes are not monitored for emergencies.
              </p>
            </div>
          ),
        },
        {
          id: "write-to-us",
          title: "Write to us",
          body: (
            <ul className="contact-grid">
              {CHANNELS.map((channel) => (
                <li key={channel.title} className="contact-card">
                  <span className="contact-card__icon">
                    <Icon name={channel.icon} size={18} />
                  </span>
                  <h3 className="contact-card__title">{channel.title}</h3>
                  <p className="contact-card__text">{channel.text}</p>
                  <a className="contact-card__link" href={`mailto:${channel.email}?subject=${encodeURIComponent(channel.subject)}`}>
                    {channel.email}
                  </a>
                </li>
              ))}
            </ul>
          ),
        },
        {
          id: "office",
          title: "Office",
          body: (
            <>
              <address className="contact-address">
                {SITE.contact.address.map((line) => (
                  <span key={line}>
                    {line}
                    <br />
                  </span>
                ))}
              </address>
              <p>
                Phone: <a href={telHref(SITE.contact.phone)}>{SITE.contact.phone}</a>
                <br />
                {SITE.contact.hours}
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
