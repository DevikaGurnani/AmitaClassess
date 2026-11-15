'use client';
import {useState} from 'react';
import {GraduationCap} from 'lucide-react';
export default function AcademyBrand(){const [available,setAvailable]=useState(true);return <><span className="academy-logo">{available?<img src="/images/academy-logo.png" alt="Amita’s Classes academy logo" onError={()=>setAvailable(false)}/>:<GraduationCap size={27}/>}</span><span className="academy-wordmark">Amita’s<span className="brand-dot">.</span><small>CLASSES</small></span></>;}
