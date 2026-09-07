export const formatCategory = (cat: string | undefined | null, t: (k: string) => string): string => {
  if (!cat) return '';
  switch (cat.trim()) {
    case 'Разное':
    case 'General':
    case 'Misc':
      return t('categories.misc');
    case 'Дом':
    case 'Home':
      return t('categories.home');
    case 'Автомобиль':
    case 'Auto':
    case 'Car':
      return t('categories.car');
    case 'Работа':
    case 'Work':
      return t('categories.work');
    case 'День рождения':
    case 'Birthday':
      return t('categories.birthday');
    case 'Секреты':
    case 'Secrets':
      return t('notes.secrets');
    default:
      return cat;
  }
};
