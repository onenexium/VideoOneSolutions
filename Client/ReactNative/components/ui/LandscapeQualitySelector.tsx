import SvgIcon from "@/components/ui/SvgIcon";
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
} from "react-native";
import { PlaybackSource } from "../../types/drama";
import { colors } from "@/constants/theme";

interface LandscapeQualitySelectorProps {
  sources: PlaybackSource[];
  currentQuality: string;
  onQualityChange: (quality: string, playInfo: PlaybackSource) => void;
}

const LandscapeQualitySelector: React.FC<LandscapeQualitySelectorProps> = ({
  sources,
  currentQuality,
  onQualityChange,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(300));

  const showModal = useCallback(() => {
    setIsVisible(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const hideModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
    });
  }, [fadeAnim, slideAnim]);

  const handleQualitySelect = (playInfo: PlaybackSource) => {
    onQualityChange(playInfo.quality, playInfo);
    hideModal();
  };

  const getCurrentQualityText = () => {
    return currentQuality || "720p";
  };

  return (
    <>
      {/* Landscape quality button */}
      <TouchableOpacity
        style={styles.landscapeQualityButton}
        onPress={showModal}
      >
        <SvgIcon
          name="quality"
          style={styles.landscapeQualityIcon}
        />
        <Text style={styles.landscapeQualityText}>
          {getCurrentQualityText()}
        </Text>
      </TouchableOpacity>

      {/* Quality selector modal */}
      <Modal
        visible={isVisible}
        transparent
        animationType="none"
        onRequestClose={hideModal}
      >
        <Animated.View
          style={[styles.modalOverlay, { opacity: fadeAnim }]}
          onTouchEnd={hideModal}
        >
          <Animated.View
            style={[
              styles.modalContent,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {/* Title */}
            <View style={styles.titleContainer}>
              <Text style={styles.title}>Video Quality</Text>
            </View>

            {/* Quality options */}
            <View style={styles.optionsContainer}>
              {sources.map((playInfo) => (
                <TouchableOpacity
                  key={playInfo.quality}
                  style={[
                    styles.qualityOption,
                    currentQuality === playInfo.quality &&
                      styles.qualityOptionActive,
                  ]}
                  onPress={() => handleQualitySelect(playInfo)}
                >
                  <Text
                    style={[
                      styles.qualityOptionText,
                      currentQuality === playInfo.quality &&
                        styles.qualityOptionTextActive,
                    ]}
                  >
                    {playInfo.quality}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  landscapeQualityButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    gap: 4,
  },
  landscapeQualityIcon: {
    width: 20,
    height: 20,
    tintColor: colors.text,
  },
  landscapeQualityText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 24,
    textAlign: "center",
    fontFamily: "PingFang SC",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 50,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 8,
    width: "90%",
    maxWidth: 375,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  titleContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  optionsContainer: {
    padding: 12,
    gap: 8,
  },
  qualityOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 2,
    alignItems: "center",
  },
  qualityOptionActive: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 8,
  },
  qualityOptionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  qualityOptionTextActive: {
    color: colors.text,
  },
  qualityOptionSubtext: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    marginTop: 2,
  },
});

export default LandscapeQualitySelector;
