import { motion } from 'framer-motion';

const pageTransition = {
  duration: 0.65,
  ease: [0.22, 1, 0.36, 1]
};

export default function PageTransition({ children, className = '' }) {
  return (
    <motion.main
      className={`page-transition ${className}`.trim()}
      initial={{ opacity: 0, y: 14, filter: 'blur(7px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -8, filter: 'blur(7px)' }}
      transition={pageTransition}
    >
      {children}
    </motion.main>
  );
}
