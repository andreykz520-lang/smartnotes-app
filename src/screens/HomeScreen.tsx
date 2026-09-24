import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView, Modal, TextInput, Alert, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { colors, spacing, borderRadius } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { useNoteStore, Note } from '../store/useNoteStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { formatCategory } from '../utils/formatCategory';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

type Props = {
  navigation: HomeScreenNavigationProp;
};

export default function HomeScreen({ navigation }: Props) {
  const notes = useNoteStore((state) => state.notes);
  const { pinCode, setPinCode } = useSettingsStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { t } = useTranslation();
  
  const customCategories = useNoteStore((state) => state.customCategories);
  const addCategory = useNoteStore((state) => state.addCategory);
  const removeCategory = useNoteStore((state) => state.removeCategory);

  const [isSecretUnlocked, setIsSecretUnlocked] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  
  const [isCategoryModalVisible, setIsCategoryModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    notes.forEach(n => {
      if (n.tags) n.tags.forEach(t => tags.add(t));
    });
    return Array.from(tags);
  }, [notes]);

  const handleKeypadPress = (digit: string) => {
    setPinError(null);
    setPinInput(prev => {
      if (prev.length >= 8) return prev;
      return prev + digit;
    });
  };

  const handleKeypadDelete = () => {
    setPinError(null);
    setPinInput(prev => prev.slice(0, -1));
  };

  const handleKeypadClear = () => {
    setPinError(null);
    setPinInput('');
  };

  const handleLockPress = () => {
    if (isSecretUnlocked) {
      setIsSecretUnlocked(false);
      if (selectedCategory === 'Секреты') setSelectedCategory(null);
    } else {
      setPinInput('');
      setPinError(null);
      setShowPin(false);
      setIsPinModalVisible(true);
    }
  };

  const handlePinSubmit = (customPin?: string) => {
    const value = typeof customPin === 'string' ? customPin : pinInput;
    if (!pinCode) {
      if (value.length < 4) {
        setPinError(t('notes.pin_min_length'));
        return;
      }
      setPinCode(value);
      setIsSecretUnlocked(true);
      setIsPinModalVisible(false);
      setSelectedCategory('Секреты');
      setPinError(null);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(t('notes.pin_created'));
      } else {
        Alert.alert(t('common.success'), t('notes.pin_created'));
      }
    } else {
      if (value === pinCode) {
        setIsSecretUnlocked(true);
        setIsPinModalVisible(false);
        setSelectedCategory('Секреты');
        setPinError(null);
      } else {
        setPinError(t('notes.wrong_pin'));
        setPinInput('');
      }
    }
  };

  React.useEffect(() => {
    if (!isPinModalVisible) return;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        setPinInput(prev => {
          if (prev.length >= 8) return prev;
          return prev + e.key;
        });
        setPinError(null);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPinInput(prev => prev.slice(0, -1));
        setPinError(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handlePinSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsPinModalVisible(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPinModalVisible, pinInput, pinCode]);

  const { isPro, isProPlus, isTrialActive, trialDaysLeft } = useAuthStore();

  React.useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.text, marginRight: 8 }}>
            SmartNotes
          </Text>
          <TouchableOpacity 
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.8}
            style={[
              styles.headerTierBadge,
              isProPlus ? styles.headerTierBadgeProPlus : isPro ? styles.headerTierBadgePro : styles.headerTierBadgeFree
            ]}
          >
            <Ionicons 
              name={isProPlus ? "sparkles" : isPro ? "star" : "shield-outline"} 
              size={11} 
              color={isProPlus ? '#c084fc' : isPro ? '#60a5fa' : '#94a3b8'} 
              style={{ marginRight: 3 }}
            />
            <Text style={[
              styles.headerTierText,
              isProPlus ? styles.headerTierTextProPlus : isPro ? styles.headerTierTextPro : styles.headerTierTextFree
            ]}>
              {isTrialActive 
                ? `PRO+ (${trialDaysLeft}д)` 
                : isProPlus 
                  ? 'PRO+' 
                  : isPro 
                    ? 'PRO' 
                    : 'FREE'}
            </Text>
          </TouchableOpacity>
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={handleLockPress} style={{ marginRight: spacing.md }}>
            <Ionicons name={isSecretUnlocked ? "lock-open-outline" : "lock-closed-outline"} size={24} color={isSecretUnlocked ? colors.accent : colors.text} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => {
              const { geminiKey, gigaChatKey, openRouterKey } = require('../store/useSettingsStore').useSettingsStore.getState();
              if (isPro || isProPlus || isTrialActive || geminiKey || gigaChatKey || openRouterKey) {
                navigation.navigate('Chat');
              } else {
                Alert.alert(t('settings.need_pro'), 'AI Чат доступен в PRO+ или при наличии собственного ключа (Сбер GigaChat, Google Gemini или OpenRouter).');
              }
            }} 
            style={{ marginRight: spacing.md }}
          >
            <Ionicons name="chatbubbles-outline" size={24} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ marginRight: spacing.md }}>
            <Ionicons name="settings-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, isSecretUnlocked, isPro, isProPlus, isTrialActive, trialDaysLeft]);

  React.useEffect(() => {
    // Trigger sync in background when home screen mounts
    const { SyncService } = require('../services/SyncService');
    SyncService.syncNotes();
  }, []);

  const filteredNotes = React.useMemo(() => {
    let visibleNotes = notes;

    if (selectedCategory === 'Секреты') {
      visibleNotes = notes.filter(note => note.isSecret);
    } else {
      visibleNotes = notes.filter(n => !n.isSecret);
      if (selectedCategory) {
        visibleNotes = visibleNotes.filter(note => {
          if (selectedCategory === 'Разное') {
            return note.category === 'Разное' || !note.category;
          }
          return note.category === selectedCategory;
        });
      } else {
        // Hide "День рождения" from the main list unless specifically searched
        if (!searchQuery.trim() && !selectedTag) {
           visibleNotes = visibleNotes.filter(note => note.category !== 'День рождения');
        }
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      visibleNotes = visibleNotes.filter(note => 
        (note.title && note.title.toLowerCase().includes(q)) || 
        (note.content && note.content.toLowerCase().includes(q))
      );
    }
    
    if (selectedTag) {
      visibleNotes = visibleNotes.filter(note => note.tags && note.tags.includes(selectedTag));
    }

    return visibleNotes;
  }, [notes, selectedCategory, isSecretUnlocked, searchQuery, selectedTag]);

  const handleDeleteNote = (noteId: string) => {
    const doDelete = () => {
      useNoteStore.getState().deleteNote(noteId);
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm) {
        if (window.confirm('Вы уверены, что хотите удалить эту заметку?')) {
          doDelete();
        }
      } else {
        doDelete();
      }
    } else {
      Alert.alert(
        'Удалить заметку',
        'Вы уверены, что хотите удалить эту заметку?',
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Удалить', style: 'destructive', onPress: doDelete }
        ]
      );
    }
  };

  const renderItem = ({ item }: { item: Note }) => (
    <TouchableOpacity 
      style={styles.noteCard}
      onPress={() => navigation.navigate('NoteEditor', { noteId: item.id })}
      onLongPress={() => handleDeleteNote(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.noteTitle} numberOfLines={1}>{item.title || t('notes.new_note')}</Text>
        <View style={styles.iconsRow}>
          {item.imageUri && <Ionicons name="image-outline" size={16} color={colors.primary} style={styles.icon} />}
          {item.hasAudio && <Ionicons name="mic-outline" size={16} color={colors.primary} style={styles.icon} />}
          {item.hasReminder && <Ionicons name="alarm-outline" size={16} color={colors.accent} style={styles.icon} />}
          <TouchableOpacity 
            onPress={(e) => {
              e?.stopPropagation?.();
              handleDeleteNote(item.id);
            }} 
            style={{ paddingLeft: 8 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.noteDate}>{item.date} {item.category ? `• ${formatCategory(item.category, t)}` : ''}</Text>
      {item.tags && item.tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {item.tags.map(tag => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      )}
      {item.content ? (
        <Text style={styles.notePreview} numberOfLines={2}>{item.content}</Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Plan Status Banner */}
      <TouchableOpacity 
        style={[
          styles.planBanner,
          isProPlus ? styles.planBannerProPlus : isPro ? styles.planBannerPro : styles.planBannerFree
        ]}
        onPress={() => navigation.navigate('Settings')}
        activeOpacity={0.85}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View style={[
            styles.planBannerIconWrap,
            isProPlus ? styles.planBannerIconWrapProPlus : isPro ? styles.planBannerIconWrapPro : styles.planBannerIconWrapFree
          ]}>
            <Ionicons 
              name={isProPlus ? "sparkles" : isPro ? "star" : "shield-outline"} 
              size={15} 
              color={isProPlus ? "#c084fc" : isPro ? "#60a5fa" : "#f59e0b"} 
            />
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[
                styles.planBannerTitle,
                isProPlus ? styles.planBannerTitleProPlus : isPro ? styles.planBannerTitlePro : styles.planBannerTitleFree
              ]}>
                {isTrialActive
                  ? `${t('settings.plan_pro_plus_trial')} (${trialDaysLeft} d.)`
                  : isProPlus
                    ? t('settings.plan_pro_plus')
                    : isPro
                      ? t('settings.plan_pro')
                      : t('settings.plan_free')}
              </Text>
            </View>
            <Text style={styles.planBannerSubtitle} numberOfLines={1}>
              {isTrialActive
                ? t('settings.plan_desc_trial')
                : isProPlus
                  ? t('settings.plan_desc_pro_plus')
                  : isPro
                    ? t('settings.plan_desc_pro')
                    : t('settings.plan_desc_free')}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('notes.search')}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.categoriesWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContainer}>
          <TouchableOpacity 
            style={[styles.categoryTab, !selectedCategory && styles.categoryTabActive]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[styles.categoryTabText, !selectedCategory && styles.categoryTabTextActive]}>{t('notes.all_notes')}</Text>
          </TouchableOpacity>
          
          {isSecretUnlocked && (
            <TouchableOpacity 
              style={[styles.categoryTab, selectedCategory === 'Секреты' && styles.categoryTabActive, { borderColor: colors.accent }]}
              onPress={() => setSelectedCategory('Секреты')}
            >
              <Text style={[styles.categoryTabText, selectedCategory === 'Секреты' && styles.categoryTabTextActive, { color: selectedCategory === 'Секреты' ? '#fff' : colors.accent }]}>{t('notes.secrets')}</Text>
            </TouchableOpacity>
          )}
          
          {customCategories.map(cat => (
            <TouchableOpacity 
              key={cat}
              style={[styles.categoryTab, selectedCategory === cat && styles.categoryTabActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.categoryTabText, selectedCategory === cat && styles.categoryTabTextActive]}>{formatCategory(cat, t)}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity 
            style={[styles.categoryTab, { borderColor: colors.primary }]}
            onPress={() => setIsCategoryModalVisible(true)}
          >
            <Text style={[styles.categoryTabText, { color: colors.primary }]}>+ {t('notes.categories_settings')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {allTags.length > 0 && (
        <View style={styles.tagsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContainer}>
            <TouchableOpacity 
              style={[styles.categoryTab, !selectedTag && styles.categoryTabActive]}
              onPress={() => setSelectedTag(null)}
            >
              <Text style={[styles.categoryTabText, !selectedTag && styles.categoryTabActive]}>{t('notes.all_tags')}</Text>
            </TouchableOpacity>
            {allTags.map(tag => (
              <TouchableOpacity 
                key={tag}
                style={[styles.categoryTab, selectedTag === tag && styles.categoryTabActive]}
                onPress={() => setSelectedTag(tag)}
              >
                <Text style={[styles.categoryTabText, selectedTag === tag && styles.categoryTabTextActive]}>#{tag}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filteredNotes}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color={colors.border} />
            <Text style={styles.emptyText}>{t('notes.empty_list')}</Text>
          </View>
        }
      />
      
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => navigation.navigate('NoteEditor', {})}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      <Modal visible={isPinModalVisible} transparent animationType="fade" onRequestClose={() => setIsPinModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
              <Ionicons name="lock-closed" size={32} color={colors.primary} style={{ marginBottom: 6 }} />
              <Text style={styles.modalTitle}>
                {pinCode ? t('notes.enter_pin') : t('notes.create_pin')}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xs }}>
                {!pinCode ? 'Придумайте PIN (4-8 цифр)' : 'Введите PIN или нажимайте кнопки'}
              </Text>
            </View>

            {/* Visual PIN dots / digits display */}
            <View style={styles.pinDisplayContainer}>
              <View style={styles.pinDotsRow}>
                {[0, 1, 2, 3].map((idx) => {
                  const hasChar = pinInput.length > idx;
                  const isChar = showPin && hasChar ? pinInput[idx] : null;
                  return (
                    <View key={idx} style={[styles.pinDot, hasChar && styles.pinDotFilled]}>
                      {isChar ? (
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.text }}>{isChar}</Text>
                      ) : null}
                    </View>
                  );
                })}
                {pinInput.length > 4 && (
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: 'bold', marginLeft: 6 }}>
                    +{pinInput.length - 4}
                  </Text>
                )}
              </View>

              {pinInput.length > 0 && (
                <TouchableOpacity onPress={() => setShowPin(!showPin)} style={{ padding: 4, marginLeft: 8 }}>
                  <Ionicons name={showPin ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Error Message */}
            {pinError ? (
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm, textAlign: 'center' }}>
                {pinError}
              </Text>
            ) : null}

            {/* On-screen Numeric Keypad */}
            <View style={styles.keypadContainer}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['C', '0', '⌫']
              ].map((row, rIdx) => (
                <View key={rIdx} style={styles.keypadRow}>
                  {row.map((btn) => (
                    <TouchableOpacity
                      key={btn}
                      style={[
                        styles.keypadButton,
                        btn === 'C' && { backgroundColor: 'transparent' },
                        btn === '⌫' && { backgroundColor: 'transparent' }
                      ]}
                      onPress={() => {
                        if (btn === 'C') handleKeypadClear();
                        else if (btn === '⌫') handleKeypadDelete();
                        else handleKeypadPress(btn);
                      }}
                      activeOpacity={0.6}
                    >
                      {btn === '⌫' ? (
                        <Ionicons name="backspace-outline" size={24} color={colors.text} />
                      ) : (
                        <Text style={[styles.keypadButtonText, btn === 'C' && { color: colors.textMuted, fontSize: 16 }]}>
                          {btn}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>

            {/* Action buttons Cancel / OK */}
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.surfaceHighlight }]} 
                onPress={() => setIsPinModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.modalButton, 
                  { backgroundColor: pinInput.length >= 4 ? colors.primary : colors.border }
                ]} 
                onPress={() => handlePinSubmit()}
                disabled={pinInput.length < 4}
              >
                <Text style={[styles.modalButtonText, { color: '#fff', fontWeight: 'bold' }]}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isCategoryModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '90%', maxHeight: '80%' }]}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: spacing.md}}>
              <Text style={styles.modalTitle}>{t('notes.categories')}</Text>
              <TouchableOpacity onPress={() => setIsCategoryModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <View style={{flexDirection: 'row', width: '100%', marginBottom: spacing.md}}>
              <TextInput
                style={[styles.searchInput, { borderWidth: 1, borderColor: colors.border, padding: spacing.sm, borderRadius: borderRadius.sm }]}
                placeholder={t('notes.new_category')}
                placeholderTextColor={colors.textMuted}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
              />
              <TouchableOpacity 
                style={{backgroundColor: colors.primary, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, marginLeft: spacing.sm}}
                onPress={() => {
                  if (newCategoryName.trim()) {
                    addCategory(newCategoryName.trim());
                    setNewCategoryName('');
                  }
                }}
              >
                <Text style={{color: '#fff', fontWeight: 'bold'}}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={customCategories}
              keyExtractor={item => item}
              style={{width: '100%'}}
              renderItem={({item}) => (
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border}}>
                  <Text style={{fontSize: 16, color: colors.text}}>{formatCategory(item, t)}</Text>
                  <TouchableOpacity onPress={() => removeCategory(item)}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContainer: {
    padding: spacing.md,
  },
  noteCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  noteTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  iconsRow: {
    flexDirection: 'row',
  },
  icon: {
    marginLeft: spacing.sm,
  },
  noteDate: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  notePreview: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHighlight,
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  categoriesWrapper: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoriesContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  categoryTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.background,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryTabText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  categoryTabTextActive: {
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    width: Platform.OS === 'web' ? 360 : '85%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    color: colors.text,
    textAlign: 'center'
  },
  pinDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    height: 36
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center'
  },
  pinDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent'
  },
  pinDotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  keypadContainer: {
    width: '100%',
    marginBottom: spacing.md,
    gap: 10
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10
  },
  keypadButton: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  keypadButtonText: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: spacing.sm
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text
  },
  tagsWrapper: {
    backgroundColor: colors.surfaceHighlight,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  tagChip: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  headerTierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  headerTierBadgeProPlus: {
    backgroundColor: '#8b5cf620',
    borderColor: '#a855f7',
  },
  headerTierBadgePro: {
    backgroundColor: '#3b82f620',
    borderColor: '#3b82f6',
  },
  headerTierBadgeFree: {
    backgroundColor: '#64748b20',
    borderColor: '#64748b',
  },
  headerTierText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerTierTextProPlus: {
    color: '#c084fc',
  },
  headerTierTextPro: {
    color: '#60a5fa',
  },
  headerTierTextFree: {
    color: '#94a3b8',
  },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  planBannerProPlus: {
    backgroundColor: '#8b5cf612',
    borderColor: '#a855f740',
  },
  planBannerPro: {
    backgroundColor: '#3b82f612',
    borderColor: '#3b82f640',
  },
  planBannerFree: {
    backgroundColor: '#f59e0b10',
    borderColor: '#f59e0b35',
  },
  planBannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planBannerIconWrapProPlus: {
    backgroundColor: '#8b5cf625',
  },
  planBannerIconWrapPro: {
    backgroundColor: '#3b82f625',
  },
  planBannerIconWrapFree: {
    backgroundColor: '#f59e0b20',
  },
  planBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  planBannerTitleProPlus: {
    color: '#c084fc',
  },
  planBannerTitlePro: {
    color: '#60a5fa',
  },
  planBannerTitleFree: {
    color: '#fbbf24',
  },
  planBannerSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
});
