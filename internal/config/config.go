package config

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Env           string     `yaml:"env"`
	StoragePath   string     `yaml:"storage_path"`
	StaticPath    string     `yaml:"static"`
	VideosPath    string     `yaml:"videos"`
	FFmpegProfile string     `yaml:"ffmpeg_profile"`
	FFmpegPATH    string     `yaml:"ffmpeg_path"`
	HTTPServer    HTTPServer `yaml:"http_server"`
}

type HTTPServer struct {
	Address string        `yaml:"address"`
	Port    string        `yaml:"port"`
	Timeout time.Duration `yaml:"timeout"`
}

func MustLoad() *Config {
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "config/local.yaml"
	}

	absPath, err := filepath.Abs(configPath)
	if err != nil {
		log.Fatalf("can not resolve config path: %v", err)
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		log.Fatalf("can not read config file %s: %v", absPath, err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		log.Fatalf("can not parse yaml: %v", err)
	}
	return &cfg
}

var CFG *Config

func init() {
	CFG = MustLoad()
	// защита от некорректного значения
	switch CFG.FFmpegProfile {
	case "cpu", "intel", "nvidia", "h265_nvenc", "amd_vaapi", "amd_amf":
		// всё ок
	default:
		CFG.FFmpegProfile = "cpu"
	}
}
