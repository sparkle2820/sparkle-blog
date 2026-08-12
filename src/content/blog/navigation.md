---
title: "LIVO-FAST·室内巡航（上篇）：Ubuntu22.04查看LIVOX Mid-360激光雷达点云并使用RTAPMAP框架进行第一次建图"
description: "雷达介绍 览沃Livox混合固态360°全景3D激光雷达（LIVOX Mid-360）为以太网 UD ..."
publishedAt: "2026-06-19T01:06:27"
updatedAt: "2026-06-19T01:14:54"
category: "engineering"
featuredImage: "/media/2026/06/微信图片_20260617192853_284_1027.jpg"
wordpressId: 200
oldUrl: "https://www.sparkle1128.top/index.php/2026/06/19/navigation/"
draft: false
---
## 雷达介绍

览沃Livox混合固态360°全景3D激光雷达（LIVOX Mid-360）为以太网 UDP 雷达，专为低速移动机器人开发（AGV、无人车、四足、服务机器人、RM 竞赛小车），内置 IMU，原生适配 ROS/ROS2，主打全景 SLAM、全向避障

![](/media/2026/06/490483922c7d81085ed0bae7378e4c14tplv-be4g95zd3a-image-1.jpg)

核心技术：自研旋转棱镜混合固态方案，非重复扫描点云，长时间积分等效高线束。
具体性能详见说明书，值得指出的是，这款雷达自带较高性能IMU，型号：ICM40609，支持激光 – 惯性融合 LIO-SAM、LIO-Livox 里程计
**同步**：PTPv2、GPS 时间同步，多雷达融合几乎无时间偏差

接线：M12航空一母三分插头（电源线9-27V、百兆网线、功能线若干）
由电源线独立供电，无需也不能用PoE口接网线，极有可能烧坏硬件

## 本人使用步骤（文尾有部分Debug方法）

### 1\. 给自己的虚拟机设置静态ip以查找雷达

(本人目前虽已有Linux双系统，但因项目初期使用VMware虚拟机，故延续使用)
首先先别急着启动虚拟机
1）Edit virtual machine settings
→左下角Add..
→Network Adapter
→勾选Bridged(桥接）: Connected directly to the physical network
（若有多个网卡，勾选Replicate physical network connection state)
→OK

![](/media/2026/06/1-1.png)


2）Power on this virtual machine

ctrl+alt+T打开终端，输入指令查看网卡IP

```
ip addr
```

一般网卡名为ens33，看它对应的IP，如果已经为192.168.1.50/24则无需更改（/24代表子网掩码255.255.255.0），如果不是，则需配置Ubuntu IP，这里以ens33为例，键入以下命令

```
sudo ip addr flush dev ens33
sudo ip addr add 192.168.1.50/24 dev ens33
sudo ip link set ens33 up
```

后再次查看网卡IP以确认

```
ip addr
```

配置好了后，我们给雷达上电，ping雷达看看能否ping通
一般来说，Mid-360雷达默认IP为192.168.1.1XX，后两位为雷达末尾序列号，本项目使用的雷达末尾两位序列号为46
故测试192.168.146

```
ping 192.168.1.146
```

若日志反馈输出及其延迟毫秒数，即ping通

如果不行可以临时关闭防火墙

```
sudo ufw disable
```

### 2.安装一些雷达的环境依赖

1）一些基础依赖

```
sudo apt update
sudo apt install -y \
  git cmake build-essential \
  python3-pip python3-colcon-common-extensions \
  ros-humble-desktop \
  ros-humble-rviz2 \
  ros-humble-sensor-msgs-py
```

加入ROS环境

```
echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc
source ~/.bashrc
```

2）安装Livox-SDK2（此为雷达底层基础库）

```
cd ~
git clone https://github.com/Livox-SDK/Livox-SDK2.git
cd Livox-SDK2
mkdir -p build
cd build
cmake ..
make -j$(nproc)
sudo make install
```

添加动态库路径

```
echo 'export LD_LIBRARY_PATH=${LD_LIBRARY_PATH}:/usr/local/lib' >> ~/.bashrc
source ~/.bashrc
```

3）安装livox\_ros\_driver2

livox\_ros\_driver2 是 Livox 官方 ROS/ROS 2 驱动，支持 ROS 2 Humble，并且 README 里明确列出 Mid360。

```
mkdir -p ~/ws_livox/src
cd ~/ws_livox/src

git clone https://github.com/Livox-SDK/livox_ros_driver2.git

cd ~/ws_livox/src/livox_ros_driver2
source /opt/ros/humble/setup.bash
./build.sh humble
```

编译完成后加载：

```
source ~/ws_livox/install/setup.bash
```

查看 launch 文件：

```
ls ~/ws_livox/src/livox_ros_driver2/launch_ROS2
```

你应该能看到类似 Mid-360 的启动文件，例如：rviz\_MID360\_launch.py，msg\_MID360\_launch.py

### 3\. 修改 Mid-360 配置文件

进入配置目录：

```
cd ~/ws_livox/src/livox_ros_driver2/config
ls
```

我们现在找Mid-360配置文件，常见名为MID360\_config.json，可以用以下命令搜索

```
grep -R "MID360" -n .
```

找到后，用nano命令修改该文件，在该文件夹下：

```
nano MID360_config.json
```

更改这些字段（人工自己找并改成如下配置）

```
...
"cmd_data_ip": "192.168.1.50",
"point_data_ip": "192.168.1.50",
"imu_data_ip": "192.168.1.50"
...
"ip": "192.168.1.146" #或者你自己的雷达IP名
```

ctrl+O→enter→ctrl+x 退出

### 4.启动Rviz2查看点云

1）打开前，先source

```
source /opt/ros/humble/setup.bash
source ~/ws_livox/install/setup.bash
```

查看可用launch文件

```
ls ~/ws_livox/src/livox_ros_driver2/launch_ROS2
```

一般为rviz\_MID360\_launch.py
我们以此为例运行

```
ros2 launch livox_ros_driver2 rviz_MID360_launch.py
```

2）检查话题

```
ros2 topic list
```

一般为/livox/lidar

进行如下检测：

```
ros2 topic hz /livox/lidar #显示频率，单位为赫兹
ros2 topic info /livox/lidar #查看消息类型
```

注意消息类型一定要是Type: sensor\_msgs/msg/PointCloud2而非customMsg，后者建图是难以调用，为LIVOX官方自制的消息类型

查点云的 frame\_id

执行：

```
ros2 topic echo /livox/lidar --once --field header
```

如果输出类似：frame\_id: livox\_frame，那 RViz2 里 Fixed Frame 就填这个。如果不是，就填你显示的那个。本文接下来都以frame\_id: livox\_frame为例进行。这个名字必须与你的完全一致。

3）打开后，Rviz2里设置
Global Options
→ Fixed Frame
→ livox\_frame

![](/media/2026/06/微信图片_20260617192853_284_1027.jpg)

添加显示Add
→ By topic
→ PointCloud2
→ /livox/lidar
建议显示参数：
Style: Points
Size (Pixels): 2
Color Transformer: AxisColor
Decay Time: 1.0
Queue Size: 10

### 5\. 安装RTAP-Map和Nav2

```
sudo apt update
sudo apt install -y \
  ros-humble-rtabmap-ros \
  ros-humble-navigation2 \
  ros-humble-nav2-bringup \
  ros-humble-robot-localization \
  ros-humble-tf2-tools \
  ros-humble-pointcloud-to-laserscan
```

确认可执行程序

```
ros2 pkg executables rtabmap_odom
ros2 pkg executables rtabmap_slam
```

应该能有rtabmap\_odom icp\_odometry，rtabmap\_slam rtabmap

建立导航测试包

```
cd ~/dev_ws/src
ros2 pkg create ugv_lidar_nav \
  --build-type ament_python \
  --dependencies rclpy geometry_msgs nav_msgs tf2_ros
```

创建目录

```
cd ~/dev_ws/src/ugv_lidar_nav
mkdir -p launch config scripts waypoints
```

创建RTAP-Map建图launch

```
nano ~/dev_ws/src/ugv_lidar_nav/launch/lidar_rtabmap_mapping.launch.py
```

写入

```
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([

        # base_link -> livox_frame 静态外参
        # 这里先假设雷达在车体前方 0.20m，高 0.35m
        # 后续上车后要按真实安装位置修改
        Node(
            package="tf2_ros",
            executable="static_transform_publisher",
            name="base_to_livox_tf",
            arguments=[
                "--x", "0.20",
                "--y", "0.0",
                "--z", "0.35",
                "--roll", "0.0",
                "--pitch", "0.0",
                "--yaw", "0.0",
                "--frame-id", "base_link",
                "--child-frame-id", "livox_frame",
            ],
        ),

        # RTAB-Map ICP 里程计
        # 输入 /livox/lidar PointCloud2
        # 输出 /icp_odom，并发布 odom -> base_link
        Node(
            package="rtabmap_odom",
            executable="icp_odometry",
            name="icp_odometry",
            output="screen",
            parameters=[{
                "frame_id": "base_link",
                "odom_frame_id": "odom",
                "publish_tf": True,

                "subscribe_scan_cloud": True,
                "subscribe_scan": False,
                "wait_for_transform": 0.3,
                "expected_update_rate": 10.0,

                "Icp/VoxelSize": "0.10",
                "Icp/PointToPlane": "true",
                "Icp/PointToPlaneK": "20",
                "Icp/MaxCorrespondenceDistance": "1.0",
                "Icp/Iterations": "20",
                "Icp/Epsilon": "0.001",
                "Icp/RangeMin": "0.3",
                "Icp/RangeMax": "20.0",
            }],
            remappings=[
                ("scan_cloud", "/livox/lidar"),
                ("odom", "/icp_odom"),
            ],
        ),

        # RTAB-Map 建图
        # 输出 /map，并发布 map -> odom
        Node(
            package="rtabmap_slam",
            executable="rtabmap",
            name="rtabmap",
            output="screen",
            parameters=[{
                "frame_id": "base_link",

                "subscribe_scan_cloud": True,
                "subscribe_scan": False,
                "subscribe_depth": False,
                "subscribe_rgb": False,
                "approx_sync": False,

                "database_path": "/home/sparkle1128/.ros/rtabmap_livox.db",
                "delete_db_on_start": True,

                "Reg/Strategy": "1",
                "RGBD/ProximityBySpace": "true",
                "RGBD/OptimizeFromGraphEnd": "false",

                "Grid/FromDepth": "false",
                "Grid/RangeMax": "15.0",
                "Grid/CellSize": "0.05",
                "Grid/ClusterRadius": "0.1",
                "Grid/GroundIsObstacle": "false",
            }],
            remappings=[
                ("scan_cloud", "/livox/lidar"),
                ("odom", "/icp_odom"),
            ],
        ),
    ])
```

这里设置了静态tf，就在livox\_frame里面，参数为：
x = 0.20 m
y = 0.00 m
z = 0.35 m
roll = 0
pitch = 0
yaw = 0
可根据实际情况用nano对此文件进行修改

编译

```
cd ~/dev_ws
colcon build --packages-select ugv_lidar_nav
source install/setup.bash
```

可以检查一下tf

```
source /opt/ros/humble/setup.bash

ros2 run tf2_ros tf2_echo base_link livox_frame
```

### 6\. 启动第一次建图

启动顺序：

终端1：启动Mid-360

```
source /opt/ros/humble/setup.bash
source ~/ws_livox/install/setup.bash

ros2 launch livox_ros_driver2 rviz_MID360_launch.py
```

终端2：启动RTAP-Map建图

```
source /opt/ros/humble/setup.bash
source ~/dev_ws/install/setup.bash

ros2 launch ugv_lidar_nav lidar_rtabmap_mapping.launch.py
```

rviz2设置：
Fixed Frame: map
Add → TF
Add → PointCloud2 → /livox/lidar
Add → Map → /map
Add → Odometry → /icp\_odom

如果map没跳出来：1. /odom正常，看这里的步骤 2. 除livox\_frame以外的topic有错误甚至都没有，看文章最后的Debug部分

1）先不要急着 Fixed Frame 用 `map`。第一次先用：Fixed Frame: odom
2）添加：
Add → TF
Add → PointCloud2 → /livox/lidar
Add → Odometry → /icp\_odom
3）确认 `/icp_odom` 正常后，再添加：Add → Map → /map
4）如果 `/map` 出来了，再把：Fixed Frame: map

终端 3：检查关键话题

```
source /opt/ros/humble/setup.bash
source ~/dev_ws/install/setup.bash

ros2 topic list
```

重点看有没有：
/livox/lidar
/icp\_odom
/map
/tf
/tf\_static

查看地图是否有：

```
ros2 topic list | grep map
```

### 都没问题，第一次建图怎么移动？

1.  原地静止 5 秒
2.  慢速直行 1 到 2 米
3.  缓慢转弯
4.  经过墙角、门框、桌腿、柱子等特征明显位置
5.  不要快速旋转雷达
6.  最后尽量回到起点附近

## Debug

**Bug1**(个人认为最有可能）：Fix frame里面没有map, TF, odom错误等，`/`map的反馈是no map received, 而/odometry的error是message contained unnormalized quaternion(sqaures of values don’t add to 1)

可以先检查当前系统到底有哪些 TF frame（也可以跳过，这里只是让你比对你现在的frame逻辑和理想逻辑）

安装工具：

```
sudo apt install -y ros-humble-tf2-tools
```

运行

```
ros2 run tf2_tools view_frames
```

它会生成一个文件：frames.pdf
打开你大概率只会看到：base\_link → livox\_frame

如果RTAPMap正常，理应是这样的
map
└── odom
└── base\_link
└── livox\_frame

研究报错，根因大概率在 **ICP odometry 没有正常输出有效姿态**，`/icp_odom`四元数非法(sqaures of values don’t add to 1)

1\. 先确认 `/icp_odom` 四元数到底是什么

```
ros2 topic echo /icp_odom --once
```

重点看orientation的x, y, z, w，正常四元数x² + y² + z² + w² ≈ 1
笔者这边的输出是
orientation:
x: 0.0
y: 0.0
z: 0.0
w: 0.0
显然非法

2.修改方法：

1）先单独验证 LiDAR 静态 TF

开一个新终端运行：

```
source /opt/ros/humble/setup.bash

ros2 run tf2_ros static_transform_publisher \
  --x 0.20 \
  --y 0.00 \
  --z 0.35 \
  --roll 0.00 \
  --pitch 0.00 \
  --yaw 0.00 \
  --frame-id base_link \
  --child-frame-id livox_frame
```

再开一个终端检查：

```
source /opt/ros/humble/setup.bash

ros2 run tf2_ros tf2_echo base_link livox_frame
```

正常应看到：

```
Translation: [0.200, 0.000, 0.350]
Rotation: [0.000, 0.000, 0.000, 1.000]
```

`Rotation w = 1.000` 说明静态 TF 的四元数是合法的，在此情况下，进行下一步：

修改建图 launch，先避免发布非法 odom

打开：

```
nano ~/dev_ws/src/ugv_lidar_nav/launch/lidar_rtabmap_mapping.launch.py
```

先把里面内容整体替换成下面这个版本。这个版本重点加了publish\_null\_when\_lost: False，这样 ICP 没跟踪上时，不会发布 0,0,0,0 这种非法四元数。

```
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([

        Node(
            package="tf2_ros",
            executable="static_transform_publisher",
            name="base_to_livox_tf",
            arguments=[
                "--x", "0.20",
                "--y", "0.00",
                "--z", "0.35",
                "--roll", "0.00",
                "--pitch", "0.00",
                "--yaw", "0.00",
                "--frame-id", "base_link",
                "--child-frame-id", "livox_frame",
            ],
        ),

        Node(
            package="rtabmap_odom",
            executable="icp_odometry",
            name="icp_odometry",
            output="screen",
            parameters=[{
                "frame_id": "base_link",
                "odom_frame_id": "odom",
                "publish_tf": True,
                "publish_null_when_lost": False,

                "subscribe_scan_cloud": True,
                "subscribe_scan": False,
                "wait_for_transform": 0.5,
                "expected_update_rate": 10.0,

                # 如果终端提示收不到点云，可以后面加 qos=2
                # "qos": 2,

                "Odom/Strategy": "0",
                "Odom/GuessMotion": "true",
                "Odom/ResetCountdown": "1",
                "Odom/FillInfoData": "true",

                # 第一次先用更稳的点到点 ICP
                "Icp/VoxelSize": "0.15",
                "Icp/PointToPlane": "false",
                "Icp/MaxCorrespondenceDistance": "1.5",
                "Icp/Iterations": "30",
                "Icp/Epsilon": "0.001",
                "Icp/RangeMin": "0.5",
                "Icp/RangeMax": "15.0",
            }],
            remappings=[
                ("scan_cloud", "/livox/lidar"),
                ("odom", "/icp_odom"),
            ],
        ),

        Node(
            package="rtabmap_slam",
            executable="rtabmap",
            name="rtabmap",
            output="screen",
            parameters=[{
                "frame_id": "base_link",

                "subscribe_scan_cloud": True,
                "subscribe_scan": False,
                "subscribe_depth": False,
                "subscribe_rgb": False,
                "approx_sync": False,

                "database_path": "/home/sparkle1128/.ros/rtabmap_livox.db",
                "delete_db_on_start": True,

                # 如果终端提示收不到点云，也可以后面加 qos=2
                # "qos": 2,

                "Reg/Strategy": "1",
                "RGBD/ProximityBySpace": "true",
                "RGBD/OptimizeFromGraphEnd": "false",

                "Grid/FromDepth": "false",
                "Grid/RangeMax": "15.0",
                "Grid/CellSize": "0.05",
                "Grid/ClusterRadius": "0.1",
                "Grid/GroundIsObstacle": "false",
            }],
            remappings=[
                ("scan_cloud", "/livox/lidar"),
                ("odom", "/icp_odom"),
            ],
        ),
    ])
```

保存后重新编译：

```
cd ~/dev_ws
colcon build --packages-select ugv_lidar_nav
source install/setup.bash
```

笔者这里Odom好了之后map也能正常接收了，如果还不行可以联系我也可以问AI

**Bug2**：**虚拟机重启后，Ubuntu 的雷达网卡 IP 被自动改掉**

以下是我ping的日志

```
PING 192.168.1.146 (192.168.1.146) 56(84) bytes of data.
From 192.168.1.129 icmp_seq=1 Destination Host Unreachable
From 192.168.1.129 icmp_seq=2 Destination Host Unreachable
From 192.168.1.129 icmp_seq=3 Destination Host Unreachable
From 192.168.1.129 icmp_seq=4 Destination Host Unreachable
From 192.168.1.129 icmp_seq=5 Destination Host Unreachable
From 192.168.1.129 icmp_seq=6 Destination Host Unreachable
```

192.168.146被自动改掉了？？？

根因：我的**两块网卡ens33和ens37都在 `192.168.1.0/24` 网段**。

```
ens33 = 192.168.1.50/24
ens37 = 192.168.1.129/24
```

先验证 ens33 能不能通雷达

```
ping -I ens33 192.168.1.146
```

如果这样能 ping 通，说明雷达、网线、IP 都没问题，只是路由走错了

解决方法：强制雷达 IP 走 ens33

```
sudo ip route replace 192.168.1.146/32 dev ens33 src 192.168.1.50
```

然后检查：

```
ip route get 192.168.1.146
```

正确结果应该类似：

```
192.168.1.146 dev ens33 src 192.168.1.50
```

再ping就好了

## 说明：

此为使用激光雷达＋IMU进行室内导航的上篇，还没有进行RTAP-MAP定位，waypoint路线配置和Nav巡航，下篇会完整记录研发过程。
