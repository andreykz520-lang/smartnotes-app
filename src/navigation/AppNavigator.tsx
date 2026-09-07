import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useAuthStore } from '../store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { View, ActivityIndicator } from 'react-native';

// Screens
import HomeScreen from '../screens/HomeScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AuthScreen from '../screens/AuthScreen';

// Stack Navigator for Notes
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function NotesStack() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen 
        name="NotesList" 
        component={HomeScreen} 
        options={{ title: t('tabs.notes') }} 
      />
      <Stack.Screen 
        name="NoteEditor" 
        component={NoteEditorScreen} 
        options={({ route }) => ({ title: (route.params as any)?.noteId ? t('notes.edit') : t('notes.new_note') })} 
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { token, isLoading, initAuth } = useAuthStore();
  const { t } = useTranslation();

  React.useEffect(() => {
    initAuth();
  }, [initAuth]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!token) {
    return (
      <NavigationContainer>
        <AuthScreen />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'document-text';

            if (route.name === 'NotesTab') {
              iconName = focused ? 'document-text' : 'document-text-outline';
            } else if (route.name === 'Chat') {
              iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
            } else if (route.name === 'Settings') {
              iconName = focused ? 'settings' : 'settings-outline';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0,
            height: 60,
            paddingBottom: 8,
            paddingTop: 8,
          },
          headerShown: false,
        })}
      >
        <Tab.Screen 
          name="NotesTab" 
          component={NotesStack} 
          options={{ tabBarLabel: t('tabs.notes') }} 
        />
        <Tab.Screen 
          name="Chat" 
          component={ChatScreen} 
          options={{ 
            tabBarLabel: t('tabs.ai_chat'),
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            title: t('tabs.ai_chat'),
          }} 
        />
        <Tab.Screen 
          name="Settings" 
          component={SettingsScreen} 
          options={{ 
            tabBarLabel: t('tabs.settings'),
            headerShown: true,
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            title: t('tabs.settings'),
          }} 
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
