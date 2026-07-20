import { motion } from 'framer-motion';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

/** section Variants component for the contact details section. */
export const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.3, ease: 'easeOut' as const },
  }),
};

interface SectionProps {
  index: number;
  value: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  children: React.ReactNode;
}

/** Section component for the contact details section. */
export function Section({ index, value, icon, label, badge, children }: SectionProps) {
  return (
    <motion.div custom={index} initial="hidden" animate="visible" variants={sectionVariants}>
      <AccordionItem value={value} className="border-border/10">
        <AccordionTrigger className="bg-background px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-background/5 hover:no-underline dark:bg-background">
          <div className="flex items-center gap-2">
            {icon}
            {label}
            {badge !== undefined && (
              <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {badge}
              </span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-4">{children}</AccordionContent>
      </AccordionItem>
    </motion.div>
  );
}
