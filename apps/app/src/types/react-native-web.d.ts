import 'react-native'

type DataSet = Record<string, string | number | boolean | undefined>

/** React Native Web props used for responsive CSS hooks and ARIA; ignored on native. */
declare module 'react-native' {
  interface ViewProps {
    dataSet?: DataSet
    'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | boolean
  }
  interface TextProps {
    dataSet?: DataSet
  }
  interface PressableProps {
    dataSet?: DataSet
    'aria-current'?: 'page' | 'step' | 'location' | 'date' | 'time' | boolean
  }
  interface PressableStateCallbackType {
    hovered?: boolean
  }
}
