import React from 'react';
import { Platform, View } from 'react-native';

let RNDateTimePicker: any = null;
if (Platform.OS !== 'web') {
  try {
    RNDateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch (e) {
    console.warn('Native DateTimePicker not available:', e);
  }
}

export default function DateTimePicker(props: any) {
  if (Platform.OS === 'web' || !RNDateTimePicker) {
    const value = props.value instanceof Date ? props.value : new Date();
    const dateStr = value.toISOString().slice(0, 16);
    return (
      <View style={{ padding: 8 }}>
        <input
          type={props.mode === 'time' ? 'time' : props.mode === 'date' ? 'date' : 'datetime-local'}
          value={props.mode === 'time' ? value.toTimeString().slice(0, 5) : props.mode === 'date' ? dateStr.slice(0, 10) : dateStr}
          onChange={(e: any) => {
            const newDate = new Date(e.target.value);
            if (!isNaN(newDate.getTime()) && props.onChange) {
              props.onChange({ type: 'set', nativeEvent: { timestamp: newDate.getTime() } }, newDate);
            }
          }}
          style={{
            backgroundColor: '#1e293b',
            color: '#ffffff',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '15px',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box'
          }}
        />
      </View>
    );
  }

  return <RNDateTimePicker {...props} />;
}
