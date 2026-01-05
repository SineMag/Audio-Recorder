import Text from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StyleSheet } from "react-native";

export default function HomeScreen() {
  return (
   
      <ThemedView style={styles.container}>
        <Text> Hi there</Text>
      </ThemedView>
  
    
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    borderColor: "black",
    borderWidth: 1,
    borderRadius: 8,
  },
  
});
