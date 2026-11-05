import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { moveflewFaq } from "@/lib/moveflew-faq";

export default function MoveFlewFaq() {
  return (
    <section className="saas-wrap" style={{ paddingBlock: "48px" }} aria-labelledby="faq-heading">
      <span className="saas-eyebrow">FAQ</span>
      <h2 id="faq-heading">Questions from moving company owners</h2>
      <Accordion type="single" collapsible className="mt-6">
        {moveflewFaq.map((item, i) => (
          <AccordionItem key={item.q} value={`faq-${i}`}>
            <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
            <AccordionContent>{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
