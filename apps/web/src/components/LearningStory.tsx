import AcademyBrand from '@/components/AcademyBrand';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, Check, GraduationCap, Leaf, Users } from 'lucide-react';

const features = [
  { icon: Users, title: 'One connected community', description: 'Students, families, and educators, together.' },
  { icon: BookOpen, title: 'More room for learning', description: 'Classes, resources, and progress in one place.' },
];

export default function LearningStory() {
  return <section className="login-story">
    <Link href="/" className="brand"><AcademyBrand /></Link>
    <div className="login-story-copy"><span className="eyebrow"><span /> A home for curious minds</span><h1>Learn together.<br />Grow beyond<br /><em>the classroom.</em></h1><p>Bring your learning community closer, with a little<br className="desktop-break" /> more clarity and a lot more possibility.</p></div>
    <div className="learning-feature-list">{features.map(({ icon: Icon, title, description }) => <div className="learning-feature" key={title}><span><Icon size={20} /></span><div><strong>{title}</strong><p>{description}</p></div><ArrowUpRight size={16} aria-hidden="true" /></div>)}</div>
    <div className="login-artwork"><img src="/images/learning-still-life.png" alt="Study books, an open notebook, and a pencil" /><span className="artwork-note"><span><Check size={15} /></span>Small steps. Brighter futures.</span></div>
    <div className="login-story-footer"><span><Leaf size={17} /> Built around your growth</span><span>AMITA’S CLASSES</span></div>
  </section>;
}
