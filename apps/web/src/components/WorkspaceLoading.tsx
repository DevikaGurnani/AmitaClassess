import type {ReactNode} from 'react';
export default function WorkspaceLoading({children}:{children?:ReactNode}){
 return <main className="workspace-loading-screen"><section className="workspace-loading-card" aria-labelledby="workspace-loading-title"><img className="workspace-loading-logo" src="/images/academy-logo.png" alt="Amita’s Classes logo" width={88} height={88}/><h1 id="workspace-loading-title">Amita’s Classes</h1>{children||<div role="status"><div className="workspace-loading-spinner" aria-hidden="true"/><h2>Please wait,</h2><p>we are setting up your environment.</p><span className="sr-only">Loading your workspace</span></div>}<small>YOUR LEARNING SPACE, READY IN A MOMENT</small></section></main>;
}
