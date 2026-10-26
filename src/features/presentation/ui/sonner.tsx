import { Toaster as Sonner } from 'sonner';
import { useTheme } from '../PresentationContext';

export function Toaster() {
  const { darkMode } = useTheme();
  return <Sonner theme={darkMode ? 'dark' : 'light'} className='toaster group' position='top-center' toastOptions={{ classNames: {
    toast: 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
    description: 'group-[.toast]:text-muted-foreground',
    actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
    cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
  } }} />;
}
